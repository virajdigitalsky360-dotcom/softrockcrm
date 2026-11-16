-- Remove the old logging from the DB trigger — the edge function now logs
-- per-recipient results into leave_email_logs directly.

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
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'created';
    v_status := NEW.status;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_status := OLD.status;
    v_status := NEW.status;
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

  v_url := (SELECT value FROM public.cron_secrets WHERE key = 'SUPABASE_URL' LIMIT 1);
  IF v_url IS NULL THEN
    RAISE NOTICE 'SUPABASE_URL not found in cron_secrets — skipping leave email';
    RETURN NEW;
  END IF;
  v_url := v_url || '/functions/v1/leave-notification';

  v_employee_email := public.resolve_employee_email(NEW.user_id, NEW.employee_name);

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

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := v_payload
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_leave_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_leave_email() TO service_role;