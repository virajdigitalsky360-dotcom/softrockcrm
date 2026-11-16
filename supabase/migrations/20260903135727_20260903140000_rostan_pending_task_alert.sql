-- Rostan's daily pending-task alert: dedup table + email log table + cron schedule

-- Dedup table: one alert per India calendar day
CREATE TABLE IF NOT EXISTS public.rostan_task_alerts (
  alert_date text NOT NULL,
  task_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alert_date)
);

-- Email log table
CREATE TABLE IF NOT EXISTS public.rostan_email_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_email text NOT NULL,
  task_count integer NOT NULL DEFAULT 0,
  task_details jsonb,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  triggered_by text NOT NULL DEFAULT 'cron',
  sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rostan_task_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rostan_email_logs ENABLE ROW LEVEL SECURITY;

-- Schedule the cron job at 12:30 UTC = 6:00 PM IST, same as existing alerts
SELECT cron.schedule(
  'rostan_pending_task_alert',
  '30 12 * * *',
  $$
SELECT net.http_post(
  url := (SELECT value FROM public.cron_secrets WHERE key = 'SUPABASE_URL' LIMIT 1)
  || '/functions/v1/rostan-pending-task-alert',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'X-Cron-Secret', (SELECT value FROM public.cron_secrets WHERE key = 'CRON_SECRET' LIMIT 1)
  ),
  body := '{}'::jsonb
);
$$
);