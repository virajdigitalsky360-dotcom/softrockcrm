-- Keep Closure Mode independent from Maintenance Mode. When enabled, authenticated
-- users other than Viraj are denied access to CRM tables and stored files.
CREATE OR REPLACE FUNCTION public.is_crm_primary_master()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, auth
AS $$
  SELECT lower(COALESCE(auth.jwt() ->> 'email', '')) = 'viraj.digitalsky360@gmail.com';
$$;

CREATE OR REPLACE FUNCTION public.crm_closure_access_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT COALESCE(
    (SELECT value FROM public.settings WHERE key = 'closure_mode'),
    'false'
  ) <> 'true'
  OR public.is_crm_primary_master();
$$;

REVOKE ALL ON FUNCTION public.is_crm_primary_master() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_crm_primary_master() TO authenticated;
REVOKE ALL ON FUNCTION public.crm_closure_access_allowed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_closure_access_allowed() TO anon, authenticated;

-- The secret is needed by trusted Edge Functions, not browser clients.
REVOKE ALL ON FUNCTION public.get_cron_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_secret() TO service_role;

-- The credential-vault RPC is intended for the Viraj-verified Edge Function.
REVOKE ALL ON FUNCTION public.set_crm_credential_admin(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_crm_credential_admin(uuid, text, text, uuid)
  TO service_role;

-- Keep settings readable so clients can detect Closure Mode. During closure,
-- block all non-Viraj setting writes and reserve the closure flag for Viraj.
DROP POLICY IF EXISTS "crm_closure_settings_insert_gate" ON public.settings;
CREATE POLICY "crm_closure_settings_insert_gate" ON public.settings
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (
    public.crm_closure_access_allowed()
    AND (key <> 'closure_mode' OR public.is_crm_primary_master())
  );

DROP POLICY IF EXISTS "crm_closure_settings_update_gate" ON public.settings;
CREATE POLICY "crm_closure_settings_update_gate" ON public.settings
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (
    public.crm_closure_access_allowed()
    AND (key <> 'closure_mode' OR public.is_crm_primary_master())
  )
  WITH CHECK (
    public.crm_closure_access_allowed()
    AND (key <> 'closure_mode' OR public.is_crm_primary_master())
  );

DROP POLICY IF EXISTS "crm_closure_settings_delete_gate" ON public.settings;
CREATE POLICY "crm_closure_settings_delete_gate" ON public.settings
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (
    public.crm_closure_access_allowed()
    AND (key <> 'closure_mode' OR public.is_crm_primary_master())
  );

-- Gate both API roles so anon-key policies cannot bypass Closure Mode. The
-- existing permissive policies continue to define normal access when it is OFF.
DO $$
DECLARE
  target_table record;
BEGIN
  FOR target_table IN
    SELECT c.relname
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
      AND c.relname <> 'settings'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'crm_closure_mode_gate',
      target_table.relname
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.crm_closure_access_allowed()) WITH CHECK (public.crm_closure_access_allowed())',
      'crm_closure_mode_gate',
      target_table.relname
    );
  END LOOP;
END;
$$;

-- Apply the same closure gate to authenticated access through Supabase Storage.
DROP POLICY IF EXISTS "crm_closure_mode_gate" ON storage.objects;
CREATE POLICY "crm_closure_mode_gate" ON storage.objects
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (public.crm_closure_access_allowed())
  WITH CHECK (public.crm_closure_access_allowed());

-- SECURITY DEFINER RPCs bypass table RLS, so guard user-callable mutation RPCs.
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_email text;
BEGIN
  IF NOT public.crm_closure_access_allowed() THEN
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
$$;

CREATE OR REPLACE FUNCTION public.set_user_team_member(p_user_id uuid, p_team_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.crm_closure_access_allowed() THEN
    RAISE EXCEPTION 'CRM Closure Mode is enabled.';
  END IF;
  IF NOT public.is_master() THEN
    RAISE EXCEPTION 'Only master users can change team membership';
  END IF;

  UPDATE public.profiles SET team_member_id = p_team_member_id WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_system_alert(p_dedup_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.crm_closure_access_allowed() THEN
    RAISE EXCEPTION 'CRM Closure Mode is enabled.';
  END IF;

  UPDATE public.system_alerts
  SET occurrence_count = occurrence_count + 1,
      last_seen_at = now(),
      updated_at = now()
  WHERE dedup_key = p_dedup_key;
END;
$$;
