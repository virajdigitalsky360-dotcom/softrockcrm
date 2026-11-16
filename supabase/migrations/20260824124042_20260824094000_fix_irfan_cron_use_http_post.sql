/*
# Fix Irfan Pending Task Cron — use net.http_post instead of net.http_request

The previous cron job used net.http_request() which does not exist in pg_net 0.20.4.
The available function is net.http_post(url, body, params, headers, timeout).
Also, app.settings.supabase_url and app.settings.cron_secret were never set as
Postgres settings, so the cron job could not retrieve them. We now store the
Supabase URL in the cron_secrets table and read both URL and secret from there.

Schedule remains: 30 12 * * * (12:30 UTC = 18:00 IST = 6 PM India time, daily).
*/

-- Store the Supabase project URL so the cron job can read it
INSERT INTO public.cron_secrets (key, value)
VALUES ('SUPABASE_URL', 'https://obqifnikjjplygaobyxk.supabase.co')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Reschedule with the correct pg_net function
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
    SELECT net.http_post(
      url := (SELECT value FROM public.cron_secrets WHERE key = 'SUPABASE_URL' LIMIT 1)
             || '/functions/v1/irfan-pending-task-alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', (SELECT value FROM public.cron_secrets WHERE key = 'CRON_SECRET' LIMIT 1)
      ),
      body := '{}'::jsonb
    );
  $$
);
