/*
# Reschedule Attendance Check from 11 AM to 10:40 AM IST

The cron job `attendance_task_check` was previously scheduled at 5:30 AM UTC (11:00 AM IST).
This reschedules it to 5:10 AM UTC (10:40 AM IST) per the new attendance time requirement.
*/
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
  '10 5 * * *',
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
