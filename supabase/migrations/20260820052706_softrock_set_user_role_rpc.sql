/*
# SOFTROCK CRM — set_user_role RPC

1. Purpose
   Allows a Master user to change another user's role (or their own) without
   granting direct UPDATE on the `profiles.role` column (which is revoked from
   anon/authenticated so users cannot self-promote).

2. Security
   - SECURITY DEFINER, runs with the function owner's privileges.
   - Checks that the caller is a master via public.is_master().
   - Rejects non-master callers with an exception.
   - search_path locked to public.

3. Usage
   Called from the Master Panel via supabase.rpc('set_user_role', { p_user_id, p_role }).
*/

CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master() THEN
    RAISE EXCEPTION 'Only master users can change roles';
  END IF;
  IF p_role NOT IN ('master','view_all','normal') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;
  UPDATE public.profiles SET role = p_role WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;