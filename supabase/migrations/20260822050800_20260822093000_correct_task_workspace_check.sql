/*
# Correct Task Workspace Validation

1. Overview
   Corrects the generic task INSERT policy so it compares the assigned team
   member's workspace with the new task's workspace. The earlier policy text
   was ambiguous and PostgreSQL resolved both sides to the assigned member,
   which did not enforce the intended relationship.

2. Modified Tables
   - `public.tasks`: replaces only the INSERT policy.

3. Security Changes
   - Task creators must have the existing task-management permission.
   - Masters retain full access.
   - Non-master tasks must reference an existing team member whose workspace
     matches the task workspace.
   - No user, team-member name, workspace, or email is hardcoded.

4. Important Notes
   - SELECT, UPDATE, and DELETE policies are unchanged.
   - Existing task data is unchanged.
*/

DROP POLICY IF EXISTS "tk_insert" ON public.tasks;
CREATE POLICY "tk_insert" ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_tasks()
    AND (
      public.is_master()
      OR EXISTS (
        SELECT 1
        FROM public.team_members assigned_member
        WHERE assigned_member.id = public.tasks.team_member_id
          AND assigned_member.workspace_id = public.tasks.workspace_id
      )
    )
  );
