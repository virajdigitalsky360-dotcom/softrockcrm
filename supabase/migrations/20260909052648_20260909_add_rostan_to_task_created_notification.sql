-- Update the notify_task_created trigger function to include Rostan in the recipients log
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
  IF EXISTS (SELECT 1 FROM public.task_created_email_logs WHERE task_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_url := (SELECT value FROM public.cron_secrets WHERE key = 'SUPABASE_URL' LIMIT 1);
  IF v_url IS NULL THEN
    RAISE NOTICE 'SUPABASE_URL not found in cron_secrets — skipping task-created email';
    RETURN NEW;
  END IF;
  v_url := v_url || '/functions/v1/task-created-notification';

  SELECT tm.name INTO v_team_member_name
  FROM public.team_members tm
  WHERE tm.id = NEW.team_member_id;

  SELECT c.name INTO v_client_name
  FROM public.clients c
  WHERE c.id = NEW.client_id;

  SELECT w.name INTO v_workspace_name
  FROM public.workspaces w
  WHERE w.id = NEW.workspace_id;

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

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := v_payload
  );

  INSERT INTO public.task_created_email_logs (task_id, task_name, recipients, status)
  VALUES (NEW.id, NEW.name, ARRAY['viraj.digitalsky360@gmail.com', 'kapilprajapati9054@gmail.com', 'softrockind@gmail.com'], 'dispatched')
  ON CONFLICT (task_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_task_created() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_task_created() TO service_role;
