-- Keep task email pause independent from Maintenance and Closure Mode.
-- Missing setting rows are interpreted as unpaused by the sender.
DROP POLICY IF EXISTS "crm_task_email_pause_insert_gate" ON public.settings;
CREATE POLICY "crm_task_email_pause_insert_gate" ON public.settings
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (
    public.crm_closure_access_allowed()
    AND (key <> 'task_email_paused' OR public.is_crm_primary_master())
  );

DROP POLICY IF EXISTS "crm_task_email_pause_update_gate" ON public.settings;
CREATE POLICY "crm_task_email_pause_update_gate" ON public.settings
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (
    public.crm_closure_access_allowed()
    AND (key <> 'task_email_paused' OR public.is_crm_primary_master())
  )
  WITH CHECK (
    public.crm_closure_access_allowed()
    AND (key <> 'task_email_paused' OR public.is_crm_primary_master())
  );

DROP POLICY IF EXISTS "crm_task_email_pause_delete_gate" ON public.settings;
CREATE POLICY "crm_task_email_pause_delete_gate" ON public.settings
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (
    public.crm_closure_access_allowed()
    AND (key <> 'task_email_paused' OR public.is_crm_primary_master())
  );
