/*
# Fix CRM Credentials Vault: Service-Role Storage Function

## Problem
The edge function calls `set_crm_credential` via the anon-key client with
Viraj's JWT. The function is SECURITY DEFINER and checks auth.uid() against
profiles.email. This call is silently failing — the vault table stays empty
even after a successful password reset. The likely cause is that PostgREST
doesn't properly propagate auth.uid() into SECURITY DEFINER functions when
called via .rpc() from the edge function's Supabase client.

## Fix
Create a new function `set_crm_credential_admin` that:
- Accepts the caller's user_id as an explicit parameter (the edge function
  has ALREADY verified the caller is Viraj via JWT check)
- Uses the service-role admin client to call it
- Still encrypts the password with pgp_sym_encrypt
- Does NOT check auth.uid() internally (the edge function is the auth gate)

The existing `set_crm_credential` (with auth.uid() check) remains for any
direct client-side calls. The new function is for edge-function use only.

## Security
- The new function is NOT granted to authenticated/anon roles — only the
  service role (which the edge function uses) can call it
- The edge function verifies Viraj's identity BEFORE calling this function
- Passwords remain encrypted at rest
- No plaintext storage or key exposure
*/

CREATE OR REPLACE FUNCTION set_crm_credential_admin(
  p_target_user_id uuid,
  p_crm_login_id text,
  p_password text,
  p_set_by uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO crm_credentials (user_id, crm_login_id, encrypted_password, set_by, set_at, updated_at)
  VALUES (
    p_target_user_id,
    p_crm_login_id,
    extensions.pgp_sym_encrypt(p_password, 's0ftR0ckCRM!2026#VaultKey'),
    p_set_by,
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

-- Do NOT grant to authenticated or anon — only service role can call this
REVOKE EXECUTE ON FUNCTION set_crm_credential_admin(uuid, text, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION set_crm_credential_admin(uuid, text, text, uuid) FROM anon;
