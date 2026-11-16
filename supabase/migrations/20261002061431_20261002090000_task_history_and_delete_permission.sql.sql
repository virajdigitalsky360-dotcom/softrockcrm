/*
# Task History Audit Log + Restrict Task Delete Permission

## Purpose
1. Create a `task_history` table that records every change to a task (who changed it, what field changed, old value, new value, when).
2. Create a trigger function `log_task_history` that fires on UPDATE of the `tasks` table, compares old vs new values, and inserts a row for each changed field.
3. Fix the task DELETE RLS policy to only allow Viraj (Primary Master) and Rostan — not Kapil, Bhagyoday, Irfan, or any other user.

## New Tables
- `task_history`
  - `id` (uuid, PK)
  - `task_id` (uuid, FK to tasks, ON DELETE CASCADE)
  - `changed_by` (uuid, FK to auth.users, nullable — the user who made the change)
  - `field_name` (text — which column changed: name, status, due_date, etc.)
  - `old_value` (text — previous value, NULL for new rows)
  - `new_value` (text — new value)
  - `action` (text — 'created' or 'updated')
  - `changed_at` (timestamptz, default now())

## New Functions
- `log_task_history()` — SECURITY DEFINER trigger function that:
  - On INSERT: logs a 'created' entry with the task name
  - On UPDATE: compares each tracked field, logs a row for each changed field
  - Uses `auth.uid()` to record who made the change
  - Tracked fields: name, client_id, team_member_id, workspace_id, due_date, due_time, status, notes

## New Triggers
- `task_history_trigger` — AFTER INSERT OR UPDATE ON tasks, fires log_task_history()

## Modified RLS Policies
- `tk_delete` on tasks: REPLACED to only allow Viraj or Rostan by email lookup
  - Old: `is_master() OR is_task_manager()` (allowed Kapil + Rostan)
  - New: checks the caller's email against viraj.digitalsky360@gmail.com OR softrockind@gmail.com

## Security
- RLS enabled on task_history
- SELECT: authenticated users can read task history (all authenticated, since task SELECT is already true)
- INSERT: only the system/trigger can insert (service role bypasses RLS; trigger is SECURITY DEFINER)
- No UPDATE or DELETE policies (history is immutable)
*/
CREATE TABLE IF NOT EXISTS task_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  action text NOT NULL DEFAULT 'updated' CHECK (action IN ('created', 'updated')),
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history (task_id);
CREATE INDEX IF NOT EXISTS idx_task_history_changed_at ON task_history (changed_at);

ALTER TABLE task_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_history_select_authenticated" ON task_history;
CREATE POLICY "task_history_select_authenticated"
  ON task_history FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT policy for authenticated/anon — only the SECURITY DEFINER trigger (service role) inserts.
-- No UPDATE or DELETE — history is immutable.

-- Trigger function to log task changes
CREATE OR REPLACE FUNCTION public.log_task_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_old_val text;
  v_new_val text;
BEGIN
  -- Get the acting user's email for logging
  SELECT email INTO v_user_email FROM profiles WHERE id = v_user_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO task_history (task_id, changed_by, field_name, old_value, new_value, action)
    VALUES (NEW.id, v_user_id, 'name', NULL, NEW.name, 'created');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Compare each tracked field
    IF OLD.name IS DISTINCT FROM NEW.name THEN
      INSERT INTO task_history (task_id, changed_by, field_name, old_value, new_value, action)
      VALUES (NEW.id, v_user_id, 'name', OLD.name::text, NEW.name::text, 'updated');
    END IF;
    IF OLD.client_id IS DISTINCT FROM NEW.client_id THEN
      INSERT INTO task_history (task_id, changed_by, field_name, old_value, new_value, action)
      VALUES (NEW.id, v_user_id, 'client_id', OLD.client_id::text, NEW.client_id::text, 'updated');
    END IF;
    IF OLD.team_member_id IS DISTINCT FROM NEW.team_member_id THEN
      INSERT INTO task_history (task_id, changed_by, field_name, old_value, new_value, action)
      VALUES (NEW.id, v_user_id, 'team_member_id', OLD.team_member_id::text, NEW.team_member_id::text, 'updated');
    END IF;
    IF OLD.workspace_id IS DISTINCT FROM NEW.workspace_id THEN
      INSERT INTO task_history (task_id, changed_by, field_name, old_value, new_value, action)
      VALUES (NEW.id, v_user_id, 'workspace_id', OLD.workspace_id::text, NEW.workspace_id::text, 'updated');
    END IF;
    IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
      INSERT INTO task_history (task_id, changed_by, field_name, old_value, new_value, action)
      VALUES (NEW.id, v_user_id, 'due_date', OLD.due_date::text, NEW.due_date::text, 'updated');
    END IF;
    IF OLD.due_time IS DISTINCT FROM NEW.due_time THEN
      INSERT INTO task_history (task_id, changed_by, field_name, old_value, new_value, action)
      VALUES (NEW.id, v_user_id, 'due_time', OLD.due_time::text, NEW.due_time::text, 'updated');
    END IF;
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO task_history (task_id, changed_by, field_name, old_value, new_value, action)
      VALUES (NEW.id, v_user_id, 'status', OLD.status::text, NEW.status::text, 'updated');
    END IF;
    IF OLD.notes IS DISTINCT FROM NEW.notes THEN
      INSERT INTO task_history (task_id, changed_by, field_name, old_value, new_value, action)
      VALUES (NEW.id, v_user_id, 'notes', OLD.notes::text, NEW.notes::text, 'updated');
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_history_trigger ON public.tasks;
CREATE TRIGGER task_history_trigger
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_history();

-- Fix task delete RLS: only Viraj (Primary Master) and Rostan can delete tasks
DROP POLICY IF EXISTS "tk_delete" ON public.tasks;
CREATE POLICY "tk_delete"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (
    COALESCE(
      (SELECT email FROM public.profiles WHERE id = auth.uid()),
      ''
    ) IN ('viraj.digitalsky360@gmail.com', 'softrockind@gmail.com')
  );

GRANT EXECUTE ON FUNCTION public.log_task_history() TO authenticated;
