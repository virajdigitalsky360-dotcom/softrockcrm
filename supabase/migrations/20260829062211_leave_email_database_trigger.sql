-- Leave email notification: database trigger + pg_net HTTP call
-- Fires AFTER INSERT or UPDATE on public.leaves, resolves the employee's
-- current email server-side, and calls the leave-notification edge function.

-- Re-create the log table if it doesn't exist (idempotent)
CREATE TABLE IF NOT EXISTS public.leave_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name text NOT NULL,
  event_type text NOT NULL,
  leave_id uuid,
  recipients text[] NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  triggered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_leave_email_logs" ON public.leave_email_logs;
DROP POLICY IF EXISTS "insert_own_leave_email_logs" ON public.leave_email_logs;

CREATE POLICY "select_own_leave_email_logs" ON public.leave_email_logs
  FOR SELECT TO authenticated USING (auth.uid() = triggered_by);

CREATE POLICY "insert_own_leave_email_logs" ON public.leave_email_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = triggered_by);

-- Grant service role (used by trigger) access to the log table
GRANT INSERT, SELECT ON public.leave_email_logs TO service_role;

-- Helper: resolve the employee's current email from user_id or employee_name
CREATE OR REPLACE FUNCTION public.resolve_employee_email(p_user_id uuid, p_employee_name text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT email FROM public.profiles WHERE id = p_user_id LIMIT 1),
    (SELECT email FROM public.team_members WHERE name = p_employee_name ORDER BY email DESC NULLS LAST LIMIT 1)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_employee_email(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_employee_email(uuid, text) TO service_role;

-- Trigger function: determines event type and calls the edge function via pg_net
CREATE OR REPLACE FUNCTION public.notify_leave_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_event text;
  v_employee_email text;
  v_status text;
  v_old_status text;
  v_payload jsonb;
  v_response jsonb;
  v_sent_to text[] := ARRAY[]::text[];
  v_failures text;
  v_recipients text[] := ARRAY['viraj.digitalsky360@gmail.com', 'kapilprajapati9054@gmail.com']::text[];
BEGIN
  -- Only act on master-created leaves (created_by IS NOT NULL means it was created by a user, not self-service default)
  -- Determine event type
  IF TG_OP = 'INSERT' THEN
    v_event := 'created';
    v_status := NEW.status;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_status := OLD.status;
    v_status := NEW.status;
    -- Only notify on actual status changes or content changes
    IF v_old_status = NEW.status
       AND OLD.from_date = NEW.from_date
       AND OLD.to_date = NEW.to_date
       AND COALESCE(OLD.reason, '') = COALESCE(NEW.reason, '')
       AND OLD.day_type = NEW.day_type THEN
      RETURN NEW;
    END IF;
    IF v_old_status != NEW.status THEN
      IF NEW.status = 'approved' THEN
        v_event := 'approved';
      ELSIF NEW.status = 'rejected' THEN
        v_event := 'rejected';
      ELSE
        v_event := 'updated';
      END IF;
    ELSE
      v_event := 'updated';
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  -- Resolve the edge function URL
  v_url := (SELECT value FROM public.cron_secrets WHERE key = 'SUPABASE_URL' LIMIT 1);
  IF v_url IS NULL THEN
    RAISE NOTICE 'SUPABASE_URL not found in cron_secrets — skipping leave email';
    RETURN NEW;
  END IF;
  v_url := v_url || '/functions/v1/leave-notification';

  -- Resolve employee's current email
  v_employee_email := public.resolve_employee_email(NEW.user_id, NEW.employee_name);
  IF v_employee_email IS NOT NULL AND v_employee_email != '' THEN
    v_recipients := array_append(v_recipients, v_employee_email);
  END IF;

  -- Build payload
  v_payload := jsonb_build_object(
    'leaveId', NEW.id,
    'employeeName', NEW.employee_name,
    'employeeEmail', v_employee_email,
    'fromDate', NEW.from_date,
    'toDate', NEW.to_date,
    'dayType', NEW.day_type,
    'reason', NEW.reason,
    'status', v_status,
    'event', v_event
  );

  -- Call the edge function via pg_net (async — we don't wait for the response)
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := v_payload
  );

  -- Log the attempt (we logged the dispatch, not the email result — the edge function returns that)
  INSERT INTO public.leave_email_logs (employee_name, event_type, leave_id, recipients, status, triggered_by)
  VALUES (NEW.employee_name, v_event, NEW.id, v_recipients, 'dispatched', NEW.created_by);

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_leave_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_leave_email() TO service_role;

-- Drop old trigger if exists, then create fresh
DROP TRIGGER IF EXISTS trigger_leave_email_notify ON public.leaves;

CREATE TRIGGER trigger_leave_email_notify
  AFTER INSERT OR UPDATE ON public.leaves
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_leave_email();