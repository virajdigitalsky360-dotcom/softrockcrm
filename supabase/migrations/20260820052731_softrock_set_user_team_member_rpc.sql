/*
# SOFTROCK CRM — set_user_team_member RPC

1. Purpose
   Allows a Master user to link a profile to a team_member row (or clear the
   link). The `profiles.team_member_id` column is revoked from anon/authenticated
   so users cannot self-assign team membership to escalate workspace access.

2. Security
   - SECURITY DEFINER.
   - Only callable by masters (public.is_master()).
   - search_path locked to public.
*/

CREATE OR REPLACE FUNCTION public.set_user_team_member(p_user_id uuid, p_team_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master() THEN
    RAISE EXCEPTION 'Only master users can change team membership';
  END IF;
  UPDATE public.profiles SET team_member_id = p_team_member_id WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_team_member(uuid, uuid) TO authenticated;