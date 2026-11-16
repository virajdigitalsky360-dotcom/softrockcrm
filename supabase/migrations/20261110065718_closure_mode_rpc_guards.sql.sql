CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  target_email text;
BEGIN
  IF public.is_closure_mode() AND NOT public.is_primary_master() THEN
    RAISE EXCEPTION 'CRM Closure Mode is enabled.';
  END IF;

  IF NOT public.is_master() THEN
    RAISE EXCEPTION 'Only master users can change roles';
  END IF;

  IF p_role NOT IN ('master', 'view_all', 'task_manager', 'normal') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  SELECT email INTO target_email FROM public.profiles WHERE id = p_user_id;

  IF target_email = 'viraj.digitalsky360@gmail.com' AND p_role <> 'master' THEN
    RAISE EXCEPTION 'Viraj is the Primary Master. The role cannot be changed or downgraded.';
  END IF;

  UPDATE public.profiles SET role = p_role WHERE id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_user_team_member(p_user_id uuid, p_team_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_closure_mode() AND NOT public.is_primary_master() THEN
    RAISE EXCEPTION 'CRM Closure Mode is enabled.';
  END IF;

  IF NOT public.is_master() THEN
    RAISE EXCEPTION 'Only master users can change team membership';
  END IF;

  UPDATE public.profiles SET team_member_id = p_team_member_id WHERE id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_system_alert(p_dedup_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_closure_mode() AND NOT public.is_primary_master() THEN
    RAISE EXCEPTION 'CRM Closure Mode is enabled.';
  END IF;

  UPDATE public.system_alerts
  SET occurrence_count = occurrence_count + 1,
      last_seen_at = now(),
      updated_at = now()
  WHERE dedup_key = p_dedup_key;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_employee_email(p_user_id uuid, p_employee_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_closure_mode() AND NOT public.is_primary_master() THEN
    RAISE EXCEPTION 'CRM Closure Mode is enabled.';
  END IF;

  RETURN COALESCE(
    (SELECT email FROM public.profiles WHERE id = p_user_id LIMIT 1),
    (SELECT email FROM public.team_members WHERE name = p_employee_name ORDER BY email DESC NULLS LAST LIMIT 1)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_crm_credential_admin(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_crm_credential_admin(uuid, text, text, uuid) TO service_role;
