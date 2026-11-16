/*
# Reschedule Irfan Pending Task Email — 6 PM India Time

Changes the daily Irfan pending-task email from 7:00 PM IST (13:30 UTC)
to 6:00 PM IST (12:30 UTC). No other logic, recipients, or configuration
is changed — only the cron schedule.
*/

DO $$
BEGIN
  PERFORM cron.unschedule('irfan_pending_task_alert');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'irfan_pending_task_alert',
  '30 12 * * *',
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
