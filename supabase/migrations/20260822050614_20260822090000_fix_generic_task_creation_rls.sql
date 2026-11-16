/*
# Fix Generic Task Creation Access

1. Overview
   Fixes task creation for all authenticated users who have the existing
   task-management permission. The previous INSERT rule required the creator's
   own profile to be linked to the same workspace as the task. That incorrectly
   rejected valid creators whose account was not linked to a team-member row,
   and it confused the creator with the person assigned to the task.

2. Modified Tables
   - `public.tasks`: INSERT policy is replaced with a generic permission check.
     The assigned team member and workspace must still be valid and consistent
     for non-master users. No task columns or existing rows are changed.

3. Security Changes
   - Adds `public.can_manage_tasks()` as a SECURITY DEFINER helper.
   - Masters retain full task access.
   - Normal users are allowed to create tasks when their role has the existing
     `manage_own_tasks` permission in the permissions catalogue.
   - View-only users do not have a task-management permission and remain unable
     to insert, update, or delete tasks.
   - The INSERT rule validates the assigned team member through a foreign-key
     relationship and confirms that the selected workspace matches that team
     member's workspace. It does not require the creator and assignee to match.
   - SELECT and existing UPDATE/DELETE policy behavior remains unchanged.

4. Important Notes
   - This is generic for every current and future team member; no person name
     or email address is hardcoded.
   - Unassigned tasks remain available to masters as before.
   - Existing task rows and CRM functionality are preserved.
*/

CREATE OR REPLACE FUNCTION public.can_manage_tasks()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_master()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.roles r ON r.name = p.role
      JOIN public.permissions pm ON pm.role_id = r.id
      WHERE p.id = auth.uid()
        AND pm.permission IN ('manage_tasks', 'manage_own_tasks')
    );
$$;

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
        WHERE assigned_member.id = team_member_id
          AND assigned_member.workspace_id = workspace_id
      )
    )
  );
