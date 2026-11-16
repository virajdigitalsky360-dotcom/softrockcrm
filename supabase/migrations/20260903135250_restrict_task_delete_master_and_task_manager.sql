-- Restrict task DELETE to master and task_manager only
-- Normal users can no longer delete tasks even if they share a workspace
DROP POLICY IF EXISTS "tk_delete" ON public.tasks;

CREATE POLICY "tk_delete" ON public.tasks
  FOR DELETE TO authenticated
  USING (is_master() OR is_task_manager());