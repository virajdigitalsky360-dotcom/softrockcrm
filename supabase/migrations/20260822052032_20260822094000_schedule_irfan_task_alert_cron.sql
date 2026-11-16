/*
# Schedule Irfan Pending Task Email — Daily 7 PM India Time

1. Overview
   Installs pg_cron and pg_net, then schedules a daily job that calls the
   irfan-pending-task-alert edge function at 7:00 PM India time (13:30 UTC).
   The edge function checks Irfan's pending tasks and sends a combined email
   via Resend only when pending tasks exist. Deduplication is handled by the
   irfan_task_alerts table (one row per India calendar day).

2. New Extensions
   - pg_cron 1.6.4: PostgreSQL-based cron scheduler.
   - pg_net 0.20.4: HTTP client for Postgres, used by the cron job to invoke
     the edge function.

3. Scheduled Job
   - Name: irfan_pending_task_alert
   - Schedule: '30 13 * * *' (13:30 UTC = 19:00 IST, daily)
   - Action: HTTP POST to the edge function endpoint with X-Cron-Secret header.

4. Security
   - The cron job sends the CRON_SECRET in the X-Cron-Secret header so the
     edge function can authenticate the request.
   - No other secrets are exposed in the job definition.
   - No tables, policies, or existing data are changed.

5. Important Notes
   - The schedule is idempotent: the job is dropped first (if it exists), then recreated.
   - pg_cron uses GMT/UTC by default; 13:30 UTC is 19:00 IST.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

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
      url := (SELECT current_setting('app.settings.supabase_url', true)) || '/functions/v1/irfan-pending-task-alert',
      method := 'POST',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', (SELECT current_setting('app.settings.cron_secret', true))
      ),
      body := '{}'::jsonb
    );
  $$
);
