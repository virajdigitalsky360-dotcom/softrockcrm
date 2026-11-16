/*
# 11 AM Task Attendance Check

1. Add `manually_overridden` boolean column to attendance_records
   - Default false
   - Set to true when a Master manually edits the record via the UI
   - The 11 AM auto-check skips members whose record is manually overridden
   - The auto-check also won't overwrite a manually-set status

2. Update the attendance trigger to set manually_overridden = true
   when the record is updated by an authenticated Master user.
   This ensures Viraj's manual override permanently sticks.

3. Schedule a cron job at 5:30 AM UTC (= 11:00 AM IST) that calls the
   attendance-task-check edge function.
*/

-- 1. Add manually_overridden column
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS manually_overridden boolean NOT NULL DEFAULT false;

-- 2. Update the trigger function to set manually_overridden when a Master edits
CREATE OR REPLACE FUNCTION public.apply_attendance_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  employee_email text;
  check_in_ist time;
  is_master_edit boolean;
BEGIN
  SELECT lower(tm.email) INTO employee_email
  FROM public.team_members tm
  WHERE tm.id = NEW.team_member_id;

  -- Block attendance records for Kapil entirely
  IF employee_email = 'kapilrajprajapati9054@gmail.com' THEN
    RAISE EXCEPTION 'Attendance records cannot be created for Kapil (Master).';
  END IF;

  -- Check if this update is from an authenticated Master user (manual edit in UI)
  is_master_edit := false;
  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'master'
    ) INTO is_master_edit;
  END IF;

  -- If a Master is editing, mark as manually overridden so the 11 AM auto-check
  -- won't overwrite this record
  IF is_master_edit AND TG_OP = 'UPDATE' THEN
    NEW.manually_overridden := true;
  END IF;

  -- Apply late/on_time rule only for non-Master employees
  -- Skip if manually overridden (Master set a specific status intentionally)
  IF employee_email NOT IN ('viraj.digitalsky360@gmail.com', 'kapilrajprajapati9054@gmail.com')
     AND NEW.check_in IS NOT NULL
     AND NEW.status IN ('on_time', 'late', 'present')
     AND NOT COALESCE(NEW.manually_overridden, false) THEN
    check_in_ist := (NEW.check_in AT TIME ZONE 'Asia/Kolkata')::time;
    IF check_in_ist > time '10:15' THEN
      NEW.status := 'late';
    ELSE
      NEW.status := 'on_time';
    END IF;
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

-- 3. Schedule the 11 AM IST (5:30 AM UTC) cron job
DO $$
DECLARE
  job_id int;
BEGIN
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'attendance_task_check';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'attendance_task_check',
  '30 5 * * *',
  $$
SELECT net.http_post(
  url := (SELECT value FROM public.cron_secrets WHERE key = 'SUPABASE_URL' LIMIT 1)
  || '/functions/v1/attendance-task-check',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'X-Cron-Secret', (SELECT value FROM public.cron_secrets WHERE key = 'CRON_SECRET' LIMIT 1)
  ),
  body := '{}'::jsonb
);
$$
);
