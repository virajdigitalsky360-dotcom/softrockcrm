/*
# Update Cron Job to Read Secret from Database

1. Overview
   Reschedules the pg_cron job to read the CRON_SECRET from the cron_secrets
   table instead of a database GUC, and hardcodes the edge function URL
   (which is public, not a secret).

2. Modified Objects
   - `irfan_pending_task_alert` cron job: rescheduled with updated SQL that
     reads the secret from public.cron_secrets.

3. Security
   - The CRON_SECRET is read from the cron_secrets table (RLS-locked, service
     role only). pg_cron runs as the postgres superuser, which bypasses RLS.
   - The supabase_url is public (not a secret) and is hardcoded in the job.
   - No tables, policies, or existing data are changed.

4. Important Notes
   - The job is unscheduled first (if it exists), then recreated.
   - Schedule remains '30 13 * * *' (13:30 UTC = 19:00 IST, daily).
*/

DO $$
BEGIN
  PERFORM cron.unschedule('irfan_pending_task_alert');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'irfan_pending_task_alert',
  '30 13 * * *',
  $$
    SELECT net.http_request(
      url := 'https://obqifnikjjplygaobyxk.supabase.co/functions/v1/irfan-pending-task-alert',
      method := 'POST',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', (SELECT value FROM public.cron_secrets WHERE key = 'CRON_SECRET')
      ),
      body := '{}'::jsonb
    );
  $$
);
