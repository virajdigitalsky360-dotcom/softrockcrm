/*
# Task Created Email Notification

1. Purpose
   When ANY team member creates a new task in the CRM, send an email
   notification to both Master users:
     - Viraj — viraj.digitalsky360@gmail.com
     - Kapil — kapilprajapati9054@gmail.com

2. Mechanism
   A database trigger fires AFTER INSERT on public.tasks.
   It resolves the task's team member name, client name, and workspace name,
   then calls the task-created-notification edge function via pg_net (async).

3. Dedup prevention
   A dedicated log table (task_created_email_logs) records each dispatch
   by task_id. The trigger checks this table before sending to prevent
   duplicate emails for the same task creation.

4. No impact on existing systems
   - Does not change task data, RLS, or permissions.
   - Does not affect the 6 PM pending email system.
   - Does not affect desktop notifications.
*/

CREATE TABLE IF NOT EXISTS public.task_created_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  task_name text NOT NULL,
  recipients text[] NOT NULL,
  status text NOT NULL DEFAULT 'dispatched',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id)
);

ALTER TABLE public.task_created_email_logs ENABLE ROW LEVEL SECURITY;

GRANT INSERT, SELECT ON public.task_created_email_logs TO service_role;

CREATE OR REPLACE FUNCTION public.notify_task_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_team_member_name text;
  v_client_name text;
  v_workspace_name text;
  v_payload jsonb;
BEGIN
  -- Dedup: if we already dispatched an email for this task, skip
  IF EXISTS (SELECT 1 FROM public.task_created_email_logs WHERE task_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Resolve the edge function URL from cron_secrets
  v_url := (SELECT value FROM public.cron_secrets WHERE key = 'SUPABASE_URL' LIMIT 1);
  IF v_url IS NULL THEN
    RAISE NOTICE 'SUPABASE_URL not found in cron_secrets — skipping task-created email';
    RETURN NEW;
  END IF;
  v_url := v_url || '/functions/v1/task-created-notification';

  -- Resolve related names
  SELECT tm.name INTO v_team_member_name
  FROM public.team_members tm
  WHERE tm.id = NEW.team_member_id;

  SELECT c.name INTO v_client_name
  FROM public.clients c
  WHERE c.id = NEW.client_id;

  SELECT w.name INTO v_workspace_name
  FROM public.workspaces w
  WHERE w.id = NEW.workspace_id;

  -- Build payload
  v_payload := jsonb_build_object(
    'taskId', NEW.id,
    'taskName', NEW.name,
    'teamMemberName', v_team_member_name,
    'clientName', v_client_name,
    'workspaceName', v_workspace_name,
    'dueDate', NEW.due_date,
    'status', NEW.status,
    'notes', NEW.notes
  );

  -- Call the edge function via pg_net (async)
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := v_payload
  );

  -- Log the dispatch (unique constraint on task_id prevents duplicates)
  INSERT INTO public.task_created_email_logs (task_id, task_name, recipients, status)
  VALUES (NEW.id, NEW.name, ARRAY['viraj.digitalsky360@gmail.com', 'kapilprajapati9054@gmail.com', 'softrockind@gmail.com'], 'dispatched')
  ON CONFLICT (task_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_task_created() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_task_created() TO service_role;

DROP TRIGGER IF EXISTS trigger_task_created_notify ON public.tasks;
CREATE TRIGGER trigger_task_created_notify
  AFTER INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_created();
