DO $$
DECLARE
  target record;
  gate_using text := '(NOT public.is_closure_mode() OR public.is_primary_master())';
BEGIN
  FOR target IN
    SELECT n.nspname AS schema_name, c.relname AS relation_name
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND c.relrowsecurity
      AND (
        (n.nspname = 'public' AND c.relname <> 'settings')
        OR (n.nspname = 'storage' AND c.relname IN ('objects', 'buckets'))
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 'closure_lockdown', target.schema_name, target.relation_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING %s WITH CHECK %s',
      'closure_lockdown', target.schema_name, target.relation_name, gate_using, gate_using
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "closure_lockdown_settings_insert" ON public.settings;
CREATE POLICY "closure_lockdown_settings_insert" ON public.settings
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (
    (NOT public.is_closure_mode() OR public.is_primary_master())
    AND (key <> 'closure_mode' OR public.is_primary_master())
  );

DROP POLICY IF EXISTS "closure_lockdown_settings_update" ON public.settings;
CREATE POLICY "closure_lockdown_settings_update" ON public.settings
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (
    (NOT public.is_closure_mode() OR public.is_primary_master())
    AND (key <> 'closure_mode' OR public.is_primary_master())
  )
  WITH CHECK (
    (NOT public.is_closure_mode() OR public.is_primary_master())
    AND (key <> 'closure_mode' OR public.is_primary_master())
  );

DROP POLICY IF EXISTS "closure_lockdown_settings_delete" ON public.settings;
CREATE POLICY "closure_lockdown_settings_delete" ON public.settings
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (
    (NOT public.is_closure_mode() OR public.is_primary_master())
    AND (key <> 'closure_mode' OR public.is_primary_master())
  );

CREATE OR REPLACE FUNCTION public.revoke_non_primary_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  DELETE FROM auth.refresh_tokens t
  USING auth.users u
  WHERE t.user_id = u.id::text
    AND lower(u.email) <> 'viraj.digitalsky360@gmail.com';

  DELETE FROM auth.sessions s
  USING auth.users u
  WHERE s.user_id = u.id
    AND lower(u.email) <> 'viraj.digitalsky360@gmail.com';
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_non_primary_sessions() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.revoke_non_primary_sessions_on_closure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  PERFORM public.revoke_non_primary_sessions();
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_non_primary_sessions_on_closure() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS closure_revoke_non_primary_sessions ON public.settings;
CREATE TRIGGER closure_revoke_non_primary_sessions
  AFTER INSERT OR UPDATE OF value ON public.settings
  FOR EACH ROW
  WHEN (NEW.key = 'closure_mode' AND NEW.value = 'true')
  EXECUTE FUNCTION public.revoke_non_primary_sessions_on_closure();

DO $$
BEGIN
  IF (SELECT value FROM public.settings WHERE key = 'closure_mode') = 'true' THEN
    PERFORM public.revoke_non_primary_sessions();
  END IF;
END;
$$;
