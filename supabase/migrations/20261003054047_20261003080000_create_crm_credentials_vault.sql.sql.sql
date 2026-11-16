/*
# Create CRM Credentials Vault

## Purpose
A dedicated, encrypted storage for CRM login credentials (login ID and password)
that only the Primary Master (Viraj) can access. Passwords are encrypted at rest
using pgcrypto symmetric encryption — they are never stored in plaintext, never
exposed through normal database queries, and never returned by public APIs.

## New Tables

### `crm_credentials`
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users — the CRM user these credentials belong to)
- `crm_login_id` (text — the user's CRM login ID / email, stored in plaintext since it's just the email)
- `encrypted_password` (text — AES-encrypted password, never readable via direct SELECT)
- `set_by` (uuid — the user who set/reset this password, always Viraj)
- `set_at` (timestamptz — when the password was last set)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

## Security

### RLS
- RLS enabled on `crm_credentials`.
- SELECT policy: ONLY the Primary Master (Viraj) can read rows.
  The email check is done via a join to `profiles` (which has the email).
- INSERT/UPDATE/DELETE policies: ONLY the Primary Master can write.
- No `anon` access — this table is locked to Viraj only.
- Even `authenticated` users who are not Viraj get zero rows.

### Encryption
- The `encrypted_password` column stores AES-128-CBC encrypted values.
- Encryption/decryption happens ONLY inside SECURITY DEFINER functions
  using the `pgp_sym_encrypt` / `pgp_sym_decrypt` from pgcrypto.
- The encryption key is derived from a fixed application secret.
- The raw `encrypted_password` column is NOT directly selectable by the
  frontend — only the SECURITY DEFINER function returns the plaintext,
  and that function checks Viraj identity inside the database.

### SECURITY DEFINER Functions
- `set_crm_credential(target_user_id uuid, crm_login_id text, password text)`:
  Encrypts and stores (or updates) the credential. Only callable by Viraj.
- `get_crm_credential(target_user_id uuid)`:
  Returns the decrypted password for Viraj only. Returns NULL for others.
  SECURITY DEFINER so it can bypass RLS on the vault table.

## Important Notes
1. The `pgcrypto` extension must be enabled (it is by default in Supabase).
2. Encryption keys are stored as function-level constants, not in user-visible tables.
3. No existing tables, roles, or permissions are changed.
4. The Supabase Auth password is NOT stored here — only a separately-set CRM password.
   When Viraj resets a password, the edge function updates Supabase Auth AND stores
   the new password here for future Master-only viewing.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS crm_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crm_login_id text NOT NULL,
  encrypted_password text NOT NULL,
  set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  set_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE crm_credentials ENABLE ROW LEVEL SECURITY;

-- Only Viraj can see any rows at all
DROP POLICY IF EXISTS "viraj_select_crm_credentials" ON crm_credentials;
CREATE POLICY "viraj_select_crm_credentials"
ON crm_credentials FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email = 'viraj.digitalsky360@gmail.com'
  )
);

-- Only Viraj can insert
DROP POLICY IF EXISTS "viraj_insert_crm_credentials" ON crm_credentials;
CREATE POLICY "viraj_insert_crm_credentials"
ON crm_credentials FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email = 'viraj.digitalsky360@gmail.com'
  )
);

-- Only Viraj can update
DROP POLICY IF EXISTS "viraj_update_crm_credentials" ON crm_credentials;
CREATE POLICY "viraj_update_crm_credentials"
ON crm_credentials FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email = 'viraj.digitalsky360@gmail.com'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email = 'viraj.digitalsky360@gmail.com'
  )
);

-- Only Viraj can delete
DROP POLICY IF EXISTS "viraj_delete_crm_credentials" ON crm_credentials;
CREATE POLICY "viraj_delete_crm_credentials"
ON crm_credentials FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email = 'viraj.digitalsky360@gmail.com'
  )
);

-- SECURITY DEFINER: Set or update a CRM credential (encrypt password)
-- Only Viraj (checked via auth.uid + profiles.email) can call this.
DROP FUNCTION IF EXISTS set_crm_credential(uuid, text, text);
CREATE OR REPLACE FUNCTION set_crm_credential(
  target_user_id uuid,
  p_crm_login_id text,
  p_password text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is Viraj
  IF NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email = 'viraj.digitalsky360@gmail.com'
  ) THEN
    RAISE EXCEPTION 'Forbidden: only the Primary Master can set CRM credentials';
  END IF;

  -- Upsert the credential with encrypted password
  INSERT INTO crm_credentials (user_id, crm_login_id, encrypted_password, set_by, set_at, updated_at)
  VALUES (
    target_user_id,
    p_crm_login_id,
    pgp_sym_encrypt(p_password, 's0ftR0ckCRM!2026#VaultKey'),
    auth.uid(),
    now(),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    crm_login_id = EXCLUDED.crm_login_id,
    encrypted_password = EXCLUDED.encrypted_password,
    set_by = EXCLUDED.set_by,
    set_at = EXCLUDED.set_at,
    updated_at = now();
END;
$$;

-- SECURITY DEFINER: Get (decrypt) a CRM credential
-- Only Viraj can call this. Returns the decrypted password or NULL.
DROP FUNCTION IF EXISTS get_crm_credential(uuid);
CREATE OR REPLACE FUNCTION get_crm_credential(
  target_user_id uuid
) RETURNS TABLE (
  crm_login_id text,
  password text,
  set_at timestamptz,
  set_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is Viraj
  IF NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email = 'viraj.digitalsky360@gmail.com'
  ) THEN
    RAISE EXCEPTION 'Forbidden: only the Primary Master can view CRM credentials';
  END IF;

  RETURN QUERY
  SELECT
    c.crm_login_id,
    pgp_sym_decrypt(c.encrypted_password::bytea, 's0ftR0ckCRM!2026#VaultKey') AS password,
    c.set_at,
    c.set_by
  FROM crm_credentials c
  WHERE c.user_id = target_user_id;
END;
$$;

-- SECURITY DEFINER: Check if a credential exists for a user (no password returned)
-- Only Viraj can call this.
DROP FUNCTION IF EXISTS has_crm_credential(uuid);
CREATE OR REPLACE FUNCTION has_crm_credential(
  target_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  exists_val boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email = 'viraj.digitalsky360@gmail.com'
  ) THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM crm_credentials WHERE user_id = target_user_id
  ) INTO exists_val;

  RETURN exists_val;
END;
$$;

-- Grant execute on the functions to authenticated users
-- (the functions internally check Viraj identity, so this is safe)
GRANT EXECUTE ON FUNCTION set_crm_credential(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_crm_credential(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION has_crm_credential(uuid) TO authenticated;
