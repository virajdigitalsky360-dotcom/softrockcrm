/*
# Fix CRM Credentials Vault Decryption

## Problem
The `get_crm_credential` and `set_crm_credential` functions call `pgp_sym_decrypt`
and `pgp_sym_encrypt` without schema-qualifying them. On Supabase, pgcrypto
functions live in the `extensions` schema, but the SECURITY DEFINER functions
set `search_path = public`, so the pgcrypto functions are not found — resulting
in "function pgp_sym_decrypt(bytea, unknown) does not exist".

## Fix
Schema-qualify all pgcrypto calls as `extensions.pgp_sym_encrypt` and
`extensions.pgp_sym_decrypt`. No table or column changes. Encryption is
unchanged — passwords remain encrypted at rest.

## Security
- No changes to RLS policies or access control.
- Viraj-only enforcement remains in place inside both functions.
- No plaintext storage or key exposure.
*/

CREATE OR REPLACE FUNCTION set_crm_credential(
  target_user_id uuid,
  p_crm_login_id text,
  p_password text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email = 'viraj.digitalsky360@gmail.com'
  ) THEN
    RAISE EXCEPTION 'Forbidden: only the Primary Master can set CRM credentials';
  END IF;

  INSERT INTO crm_credentials (user_id, crm_login_id, encrypted_password, set_by, set_at, updated_at)
  VALUES (
    target_user_id,
    p_crm_login_id,
    extensions.pgp_sym_encrypt(p_password, 's0ftR0ckCRM!2026#VaultKey'),
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
SET search_path = public, extensions
AS $$
BEGIN
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
    extensions.pgp_sym_decrypt(c.encrypted_password::bytea, 's0ftR0ckCRM!2026#VaultKey') AS password,
    c.set_at,
    c.set_by
  FROM crm_credentials c
  WHERE c.user_id = target_user_id;
END;
$$;

-- Re-grant execute (recreating the functions drops existing grants)
GRANT EXECUTE ON FUNCTION set_crm_credential(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_crm_credential(uuid) TO authenticated;
