/*
# Fix Irfan's access to the FREELANCE ("Reel") workspace

## Problems
1. The FREELANCE workspace was in the original seed but is missing from the DB.
   The nav still links to /workspace/freelance, so the workspace page shows
   "Workspace not found".
2. Irfan's profile → team_member → workspace is GRAPHICS only. The RLS
   `current_workspace_id()` returns a single workspace, so the INSERT policy
   on tasks rejects task creation in any other workspace.
3. A duplicate "irfan" (lowercase, no email) team member was created in
   VIDEO EDITOR — garbage to clean up.
4. Yuvraj's profile has no team_member_id, so he can't create tasks either.

## Fix
1. Re-insert the FREELANCE workspace (restoring seed data, not a new group).
2. Create a proper team_members row for Irfan in FREELANCE with his email.
3. Create a team_members row for Yuvraj in FREELANCE (per original seed).
4. Link Yuvraj's profile to that team member.
5. Delete the duplicate "irfan" (lowercase, no email) team member.
6. Replace current_workspace_id() with current_workspace_ids() (set-returning)
   and update the task INSERT/UPDATE and task_notes INSERT/DELETE RLS policies
   so a user can create/edit tasks in ANY workspace where they have a
   team_member row (matched by email). Masters and task_managers are unaffected.
*/

-- 1. Restore FREELANCE workspace
INSERT INTO public.workspaces (name, slug) VALUES
  ('FREELANCE', 'freelance')
ON CONFLICT (name) DO NOTHING;

-- 2. Add Irfan as a team member in FREELANCE
INSERT INTO public.team_members (name, workspace_id, email)
SELECT 'Irfan', w.id, 'irfankhan797651@gmail.com'
FROM public.workspaces w
WHERE w.slug = 'freelance'
ON CONFLICT DO NOTHING;

-- 3. Add Yuvraj as a team member in FREELANCE (per original seed)
INSERT INTO public.team_members (name, workspace_id, email)
SELECT 'Yuvraj', w.id, 'yuvrajpatelyuvrajpatel9090@gmail.com'
FROM public.workspaces w
WHERE w.slug = 'freelance'
ON CONFLICT DO NOTHING;

-- 4. Link Yuvraj's profile to the FREELANCE team member
UPDATE public.profiles p
SET team_member_id = (
  SELECT tm.id FROM public.team_members tm
  WHERE tm.email = 'yuvrajpatelyuvrajpatel9090@gmail.com'
  LIMIT 1
)
WHERE p.email = 'yuvrajpatelyuvrajpatel9090@gmail.com'
  AND p.team_member_id IS NULL;

-- 5. Delete the duplicate "irfan" (lowercase, no email) in VIDEO EDITOR
DELETE FROM public.team_members
WHERE name = 'irfan' AND email IS NULL;

-- 6. Drop dependent policies FIRST, then the old function, then recreate

-- Drop task policies that reference current_workspace_id()
DROP POLICY IF EXISTS "tk_insert" ON public.tasks;
DROP POLICY IF EXISTS "tk_update" ON public.tasks;
DROP POLICY IF EXISTS "tn_insert" ON public.task_notes;
DROP POLICY IF EXISTS "tn_delete" ON public.task_notes;

-- Now safe to drop the old function
DROP FUNCTION IF EXISTS public.current_workspace_id();

-- Create the new set-returning function
CREATE OR REPLACE FUNCTION public.current_workspace_ids()
RETURNS TABLE (workspace_id uuid)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT tm.workspace_id
  FROM public.profiles p
  JOIN public.team_members tm ON tm.id = p.team_member_id
  WHERE p.id = auth.uid()
  UNION
  SELECT tm.workspace_id
  FROM public.profiles p
  JOIN public.team_members tm ON tm.email = p.email
  WHERE p.id = auth.uid()
$$;

-- 7. Recreate task INSERT policy
CREATE POLICY "tk_insert" ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    is_master()
    OR is_task_manager()
    OR (
      can_manage_tasks()
      AND tasks.workspace_id IN (SELECT workspace_id FROM public.current_workspace_ids())
      AND EXISTS (
        SELECT 1 FROM team_members assigned_member
        WHERE assigned_member.id = tasks.team_member_id
          AND assigned_member.workspace_id = tasks.workspace_id
      )
    )
  );

-- 8. Recreate task UPDATE policy
CREATE POLICY "tk_update" ON public.tasks FOR UPDATE
  TO authenticated
  USING (
    is_master()
    OR is_task_manager()
    OR tasks.workspace_id IN (SELECT workspace_id FROM public.current_workspace_ids())
  )
  WITH CHECK (
    is_master()
    OR is_task_manager()
    OR tasks.workspace_id IN (SELECT workspace_id FROM public.current_workspace_ids())
  );

-- 9. Recreate task_notes INSERT policy
CREATE POLICY "tn_insert" ON public.task_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    is_master()
    OR EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
        AND (
          is_master()
          OR t.workspace_id IN (SELECT workspace_id FROM public.current_workspace_ids())
        )
    )
  );

-- 10. Recreate task_notes DELETE policy
CREATE POLICY "tn_delete" ON public.task_notes FOR DELETE
  TO authenticated
  USING (
    is_master()
    OR EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
        AND t.workspace_id IN (SELECT workspace_id FROM public.current_workspace_ids())
    )
  );
