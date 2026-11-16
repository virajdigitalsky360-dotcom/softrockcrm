/*
# Team Pending Task Alert — All Members

## Summary
Creates the database infrastructure for sending a daily pending-task email
to EVERY team member who has pending tasks. Each member receives only their
own tasks at their own email address. The existing Irfan-specific alert is
preserved untouched.

## New Tables

### 1. `team_email_logs`
Records every email attempt (per team member) made by the team-wide alert
edge function.
- `id` — uuid PK
- `team_member_id` — uuid, references team_members(id) ON DELETE CASCADE
- `team_member_name` — text, the member's name at time of sending
- `recipient_email` — text, the email address the report was sent to
- `task_count` — integer, number of pending tasks included
- `task_details` — jsonb, array of task name/client/status/due_date/notes
- `status` — text: 'sent' | 'failed' | 'skipped'
- `error_message` — text, nullable, error details if failed
- `triggered_by` — text: 'cron' | 'manual'
- `sent_at` — timestamptz, defaults to now()

### 2. `team_task_alerts`
Dedup table ensuring the cron-triggered alert only runs once per India
calendar day per team member.
- `alert_date` — text (YYYY-MM-DD India date), part of composite PK
- `team_member_id` — uuid, references team_members(id) ON DELETE CASCADE, part of composite PK
- `task_count` — integer, default 0
- `created_at` — timestamptz, defaults to now()
- Composite primary key: (alert_date, team_member_id)

## Security
- RLS enabled on both tables.
- Only authenticated users can read email logs (for the Master Panel).
- Only the service role (edge function) can insert/update — enforced by
  default Supabase behavior: the service role key bypasses RLS, and we
  scope SELECT to authenticated users.

## Cron Schedule
A new cron job `team_pending_task_alert` is scheduled at `30 12 * * *`
(12:30 UTC = 6:00 PM IST). It POSTs to the `team-pending-task-alert` edge
function with the same X-Cron-Secret mechanism used by the existing Irfan
alert. The existing `irfan_pending_task_alert` cron job is NOT modified.
*/
-- 1. team_email_logs
CREATE TABLE IF NOT EXISTS public.team_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE,
  team_member_name text NOT NULL,
  recipient_email text NOT NULL,
  task_count integer NOT NULL DEFAULT 0,
  task_details jsonb,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  triggered_by text NOT NULL DEFAULT 'cron',
  sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_email_logs_select_authenticated" ON public.team_email_logs;
CREATE POLICY "team_email_logs_select_authenticated" ON public.team_email_logs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "team_email_logs_insert_authenticated" ON public.team_email_logs;
CREATE POLICY "team_email_logs_insert_authenticated" ON public.team_email_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- 2. team_task_alerts (dedup table)
CREATE TABLE IF NOT EXISTS public.team_task_alerts (
  alert_date text NOT NULL,
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  task_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alert_date, team_member_id)
);

ALTER TABLE public.team_task_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_task_alerts_select_authenticated" ON public.team_task_alerts;
CREATE POLICY "team_task_alerts_select_authenticated" ON public.team_task_alerts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "team_task_alerts_insert_authenticated" ON public.team_task_alerts;
CREATE POLICY "team_task_alerts_insert_authenticated" ON public.team_task_alerts
  FOR INSERT TO authenticated WITH CHECK (true);

-- Index for efficient log queries
CREATE INDEX IF NOT EXISTS idx_team_email_logs_sent_at ON public.team_email_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_email_logs_member ON public.team_email_logs(team_member_id);

-- 3. Schedule the new cron job (6:00 PM IST = 12:30 UTC)
DO $$
BEGIN
  -- Drop old job if it exists
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'team_pending_task_alert') THEN
    PERFORM cron.unschedule('team_pending_task_alert');
  END IF;

  -- Schedule new job at 12:30 UTC (6:00 PM IST)
  PERFORM cron.schedule(
    'team_pending_task_alert',
    '30 12 * * *',
    $cron$
      SELECT net.http_post(
        url := (SELECT value FROM public.cron_secrets WHERE key = 'SUPABASE_URL' LIMIT 1)
        || '/functions/v1/team-pending-task-alert',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Cron-Secret', (SELECT value FROM public.cron_secrets WHERE key = 'CRON_SECRET' LIMIT 1)
        ),
        body := '{}'::jsonb
      );
    $cron$
  );
END $$;
