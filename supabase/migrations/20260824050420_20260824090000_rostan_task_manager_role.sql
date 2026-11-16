/*
# Rostan: task_manager role + email change to softrockind@gmail.com

1. Overview
   Adds a new `task_manager` role that grants full task management across ALL
   workspaces and team members, but does NOT grant Master Panel, Control Panel,
   user management, permission management, or system settings access.
   Rostan's login email changes from softrockwork@gmail.com to
   softrockind@gmail.com, and the profile is upgraded to task_manager.

2. Schema changes
   - profiles.role CHECK constraint: add 'task_manager' as a valid value.
   - roles table: insert 'task_manager' row with relevant permissions.
   - permissions table: add task_manager permissions (manage_tasks,
     view_all_tasks, view_reports) but NOT access_master_panel,
     access_control_panel, manage_users, manage_permissions,
     manage_clients, manage_team, manage_workspaces, system_settings.

3. Helper function updates
   - is_task_manager(): new helper for RLS policies.
   - can_view_leaves(): email updated from softrockwork@gmail.com to
     softrockind@gmail.com.
   - handle_new_user() trigger: softrockind@gmail.com gets task_manager role
     and auto-links to Rostan's team member record.

4. RLS policy updates (tasks table only)
   - tk_insert: allow task_manager to insert ANY task (no workspace restriction).
   - tk_update: allow task_manager to update ANY task.
   - tk_delete: allow task_manager to delete ANY task.
   - tk_select: unchanged (all authenticated users can see all tasks).

5. Data changes
   - Rostan's team_members.email updated to softrockind@gmail.com.
   - Rostan's profiles row: email updated, role set to task_manager.
   - auth.users email updated so login works with the new email.

6. Security
   - RLS remains enabled on all tables.
   - Master accounts (viraj.digitalsky360@gmail.com, kprajapati9054@gmail.com)
     are NOT changed.
   - task_manager cannot access Master Panel, Control Panel, user management,
     permission management, or system settings.
   - task_manager can only manage tasks — not clients, team members, or
     workspaces (those remain master-only).
*/

-- 1. Add task_manager to the profiles role CHECK constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('master','view_all','normal','task_manager'));

-- 2. Add task_manager role and permissions
INSERT INTO public.roles (name, description)
VALUES ('task_manager', 'Full task management across all workspaces; no admin access')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.permissions (role_id, permission, description)
SELECT r.id, v.perm, v.descr
FROM public.roles r
CROSS JOIN (VALUES
  ('manage_tasks', 'Create, edit, delete any task'),
  ('view_all_tasks', 'View every task across all workspaces'),
  ('view_reports', 'View reports')
) AS v(perm, descr)
WHERE r.name = 'task_manager'
ON CONFLICT DO NOTHING;

-- 3. New helper: is_task_manager()
CREATE OR REPLACE FUNCTION public.is_task_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_role() = 'task_manager';
$$;
GRANT EXECUTE ON FUNCTION public.is_task_manager() TO authenticated;

-- 4. Update can_view_leaves() to use the new email
CREATE OR REPLACE FUNCTION public.can_view_leaves()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.email IN (
      'viraj.digitalsky360@gmail.com',
      'kprajapati9054@gmail.com',
      'softrockind@gmail.com'
    )
  );
$$;

-- 5. Update auth trigger: softrockind@gmail.com gets task_manager
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_tm uuid;
BEGIN
  v_role := CASE
    WHEN new.email IN ('viraj.digitalsky360@gmail.com','kprajapati9054@gmail.com') THEN 'master'
    WHEN new.email = 'softrockind@gmail.com' THEN 'task_manager'
    ELSE 'normal'
  END;
  SELECT id INTO v_tm FROM public.team_members WHERE email = new.email;
  INSERT INTO public.profiles (id, email, role, team_member_id)
  VALUES (new.id, new.email, v_role, v_tm)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- 6. Update task RLS policies to allow task_manager full access
DROP POLICY IF EXISTS "tk_insert" ON public.tasks;
CREATE POLICY "tk_insert" ON public.tasks FOR INSERT
  TO authenticated WITH CHECK (
    public.is_master()
    OR public.is_task_manager()
    OR (public.can_manage_tasks()
        AND public.current_workspace_id() IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.team_members assigned_member
          WHERE assigned_member.id = tasks.team_member_id
            AND assigned_member.workspace_id = tasks.workspace_id
        )
        AND tasks.workspace_id = public.current_workspace_id())
  );

DROP POLICY IF EXISTS "tk_update" ON public.tasks;
CREATE POLICY "tk_update" ON public.tasks FOR UPDATE
  TO authenticated
  USING (
    public.is_master()
    OR public.is_task_manager()
    OR (public.current_workspace_id() IS NOT NULL
        AND workspace_id = public.current_workspace_id())
  )
  WITH CHECK (
    public.is_master()
    OR public.is_task_manager()
    OR (public.current_workspace_id() IS NOT NULL
        AND workspace_id = public.current_workspace_id())
  );

DROP POLICY IF EXISTS "tk_delete" ON public.tasks;
CREATE POLICY "tk_delete" ON public.tasks FOR DELETE
  TO authenticated USING (
    public.is_master()
    OR public.is_task_manager()
    OR (public.current_workspace_id() IS NOT NULL
        AND workspace_id = public.current_workspace_id())
  );

-- 7. Update Rostan's team member email
UPDATE public.team_members
SET email = 'softrockind@gmail.com'
WHERE name = 'Rostan'
  AND workspace_id = (SELECT id FROM public.workspaces WHERE slug = 'social-media');

-- 8. Update Rostan's profile: new email + task_manager role
UPDATE public.profiles
SET email = 'softrockind@gmail.com',
    role = 'task_manager'
WHERE email = 'softrockwork@gmail.com';

-- 9. Update the auth.users email so login works with the new email
UPDATE auth.users
SET email = 'softrockind@gmail.com',
    email_change_confirm_status = 1
WHERE email = 'softrockwork@gmail.com';
