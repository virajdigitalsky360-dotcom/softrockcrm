/*
# SOFTROCK CRM — Core Schema

1. Overview
   Creates the full database layer for the SOFTROCK task-management CRM:
   workspaces, team members, clients, tasks, task notes, sticky notes,
   profiles (linked to auth.users), roles, permissions, and settings.

2. New Tables
   - workspaces: the four team workspaces (VIDEO EDITOR, FREELANCE, SOCIAL MEDIA, GRAPHICS).
   - team_members: named people, each belonging to a workspace; optional email to link to an auth account.
   - clients: client organisations; every task references one client.
   - tasks: a unit of work — name, client, assigned person, workspace, due date, status, notes.
   - task_notes: a log of individual note entries attached to a task.
   - sticky_notes: per-user auto-saved scratch note on the dashboard.
   - profiles: one row per auth.user, carrying role (master/view_all/normal) and optional team-member link.
   - roles: definition of the three permission levels.
   - permissions: permission entries per role (descriptive catalogue).
   - settings: key/value system settings for the Master Panel.

3. Helper Functions (SECURITY DEFINER, used inside RLS policies)
   - current_role()        -> role of the signed-in user ('normal' if unknown).
   - is_master()           -> true when the signed-in user is a Master.
   - is_view_only()        -> true when the signed-in user is the View-All user.
   - current_team_member_id() -> team_member row linked to the signed-in user (or null).
   - current_workspace_id()   -> workspace of that team member (or null).

4. Auth
   - Trigger on auth.users auto-creates a profile on signup, assigning role by email:
       viraj.digitalsky360@gmail.com / kprajapati9054@gmail.com -> master
       softrockwork@gmail.com -> view_all
       everyone else -> normal
   - It also auto-links the profile to a team member when the signup email matches a seeded member.

5. Row Level Security (enforced at the database)
   - tasks:           SELECT for all authenticated; writes for masters OR members of the task's workspace.
   - clients:         SELECT for all authenticated; writes for masters only.
   - team_members:    SELECT for all authenticated; writes for masters only.
   - workspaces:      SELECT for all authenticated; writes for masters only.
   - task_notes:      SELECT for all authenticated; writes follow task ownership rules.
   - sticky_notes:    each user only sees/edits their own row.
   - profiles:        SELECT own; UPDATE own (role column revoked from anon/authenticated so users cannot self-promote).
   - roles/permissions/settings: SELECT for all authenticated; writes for masters only.

6. Notes
   - No priority field exists anywhere, by design.
   - All timestamps are timestamptz, defaulting to now().
*/

-- ---------- workspaces ----------
CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- team_members ----------
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_members_workspace_idx ON public.team_members(workspace_id);
CREATE INDEX IF NOT EXISTS team_members_email_idx ON public.team_members(email);

-- ---------- clients ----------
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- tasks ----------
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  due_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status in ('pending','in_progress','completed')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_workspace_idx ON public.tasks(workspace_id);
CREATE INDEX IF NOT EXISTS tasks_team_member_idx ON public.tasks(team_member_id);
CREATE INDEX IF NOT EXISTS tasks_client_idx ON public.tasks(client_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks(status);
CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON public.tasks(due_date);

-- auto-touch updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tasks_touch_updated_at ON public.tasks;
CREATE TRIGGER tasks_touch_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- task_notes ----------
CREATE TABLE IF NOT EXISTS public.task_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_notes_task_idx ON public.task_notes(task_id);

-- ---------- sticky_notes ----------
CREATE TABLE IF NOT EXISTS public.sticky_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sticky_notes_user_idx ON public.sticky_notes(user_id);

-- ---------- profiles ----------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  role text NOT NULL DEFAULT 'normal' CHECK (role in ('master','view_all','normal')),
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- roles ----------
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text
);

-- ---------- permissions ----------
CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE,
  permission text NOT NULL,
  description text
);

-- ---------- settings ----------
CREATE TABLE IF NOT EXISTS public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Helper functions (SECURITY DEFINER so policies don't recurse)
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), 'normal');
$$;

CREATE OR REPLACE FUNCTION public.is_master()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_role() = 'master';
$$;

CREATE OR REPLACE FUNCTION public.is_view_only()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_role() = 'view_all';
$$;

CREATE OR REPLACE FUNCTION public.current_team_member_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_member_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_workspace_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tm.workspace_id
  FROM public.profiles p
  JOIN public.team_members tm ON tm.id = p.team_member_id
  WHERE p.id = auth.uid();
$$;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sticky_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- ---------- workspaces ----------
DROP POLICY IF EXISTS "ws_select" ON public.workspaces;
CREATE POLICY "ws_select" ON public.workspaces FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "ws_write" ON public.workspaces;
CREATE POLICY "ws_write" ON public.workspaces FOR ALL
  TO authenticated
  USING (public.is_master()) WITH CHECK (public.is_master());

-- ---------- team_members ----------
DROP POLICY IF EXISTS "tm_select" ON public.team_members;
CREATE POLICY "tm_select" ON public.team_members FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "tm_insert" ON public.team_members;
CREATE POLICY "tm_insert" ON public.team_members FOR INSERT
  TO authenticated WITH CHECK (public.is_master());
DROP POLICY IF EXISTS "tm_update" ON public.team_members;
CREATE POLICY "tm_update" ON public.team_members FOR UPDATE
  TO authenticated USING (public.is_master()) WITH CHECK (public.is_master());
DROP POLICY IF EXISTS "tm_delete" ON public.team_members;
CREATE POLICY "tm_delete" ON public.team_members FOR DELETE
  TO authenticated USING (public.is_master());

-- ---------- clients ----------
DROP POLICY IF EXISTS "cl_select" ON public.clients;
CREATE POLICY "cl_select" ON public.clients FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "cl_insert" ON public.clients;
CREATE POLICY "cl_insert" ON public.clients FOR INSERT
  TO authenticated WITH CHECK (public.is_master());
DROP POLICY IF EXISTS "cl_update" ON public.clients;
CREATE POLICY "cl_update" ON public.clients FOR UPDATE
  TO authenticated USING (public.is_master()) WITH CHECK (public.is_master());
DROP POLICY IF EXISTS "cl_delete" ON public.clients;
CREATE POLICY "cl_delete" ON public.clients FOR DELETE
  TO authenticated USING (public.is_master());

-- ---------- tasks ----------
DROP POLICY IF EXISTS "tk_select" ON public.tasks;
CREATE POLICY "tk_select" ON public.tasks FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "tk_insert" ON public.tasks;
CREATE POLICY "tk_insert" ON public.tasks FOR INSERT
  TO authenticated WITH CHECK (
    public.is_master()
    OR (public.current_workspace_id() IS NOT NULL
        AND workspace_id = public.current_workspace_id())
  );
DROP POLICY IF EXISTS "tk_update" ON public.tasks;
CREATE POLICY "tk_update" ON public.tasks FOR UPDATE
  TO authenticated
  USING (
    public.is_master()
    OR (public.current_workspace_id() IS NOT NULL
        AND workspace_id = public.current_workspace_id())
  )
  WITH CHECK (
    public.is_master()
    OR (public.current_workspace_id() IS NOT NULL
        AND workspace_id = public.current_workspace_id())
  );
DROP POLICY IF EXISTS "tk_delete" ON public.tasks;
CREATE POLICY "tk_delete" ON public.tasks FOR DELETE
  TO authenticated USING (
    public.is_master()
    OR (public.current_workspace_id() IS NOT NULL
        AND workspace_id = public.current_workspace_id())
  );

-- ---------- task_notes ----------
DROP POLICY IF EXISTS "tn_select" ON public.task_notes;
CREATE POLICY "tn_select" ON public.task_notes FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "tn_insert" ON public.task_notes;
CREATE POLICY "tn_insert" ON public.task_notes FOR INSERT
  TO authenticated WITH CHECK (
    public.is_master()
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (public.is_master()
             OR (public.current_workspace_id() IS NOT NULL
                 AND t.workspace_id = public.current_workspace_id()))
    )
  );
DROP POLICY IF EXISTS "tn_delete" ON public.task_notes;
CREATE POLICY "tn_delete" ON public.task_notes FOR DELETE
  TO authenticated USING (
    public.is_master()
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (public.current_workspace_id() IS NOT NULL
             AND t.workspace_id = public.current_workspace_id())
    )
  );

-- ---------- sticky_notes ----------
DROP POLICY IF EXISTS "sn_select" ON public.sticky_notes;
CREATE POLICY "sn_select" ON public.sticky_notes FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "sn_insert" ON public.sticky_notes;
CREATE POLICY "sn_insert" ON public.sticky_notes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "sn_update" ON public.sticky_notes;
CREATE POLICY "sn_update" ON public.sticky_notes FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "sn_delete" ON public.sticky_notes;
CREATE POLICY "sn_delete" ON public.sticky_notes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ---------- profiles ----------
DROP POLICY IF EXISTS "pf_select" ON public.profiles;
CREATE POLICY "pf_select" ON public.profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);
-- users may update their own profile, but NOT the role column (revoked below)
DROP POLICY IF EXISTS "pf_update" ON public.profiles;
CREATE POLICY "pf_update" ON public.profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
-- revoke the ability to change role / team_member_id from non-service roles
REVOKE UPDATE (role, team_member_id) ON public.profiles FROM anon, authenticated;

-- ---------- roles ----------
DROP POLICY IF EXISTS "ro_select" ON public.roles;
CREATE POLICY "ro_select" ON public.roles FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "ro_write" ON public.roles;
CREATE POLICY "ro_write" ON public.roles FOR ALL
  TO authenticated USING (public.is_master()) WITH CHECK (public.is_master());

-- ---------- permissions ----------
DROP POLICY IF EXISTS "pm_select" ON public.permissions;
CREATE POLICY "pm_select" ON public.permissions FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "pm_write" ON public.permissions;
CREATE POLICY "pm_write" ON public.permissions FOR ALL
  TO authenticated USING (public.is_master()) WITH CHECK (public.is_master());

-- ---------- settings ----------
DROP POLICY IF EXISTS "st_select" ON public.settings;
CREATE POLICY "st_select" ON public.settings FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "st_write" ON public.settings;
CREATE POLICY "st_write" ON public.settings FOR ALL
  TO authenticated USING (public.is_master()) WITH CHECK (public.is_master());

-- ============================================================
-- Auth trigger: auto-create profile on signup
-- ============================================================
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
    WHEN new.email = 'softrockwork@gmail.com' THEN 'view_all'
    ELSE 'normal'
  END;
  SELECT id INTO v_tm FROM public.team_members WHERE email = new.email;
  INSERT INTO public.profiles (id, email, role, team_member_id)
  VALUES (new.id, new.email, v_role, v_tm)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable realtime on the tables the UI subscribes to
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workspaces;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sticky_notes;