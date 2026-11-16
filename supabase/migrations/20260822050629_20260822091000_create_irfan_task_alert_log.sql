/*
# Add Irfan Pending Task Alert Log

1. Overview
   Adds durable server-side state so the daily Irfan pending-task email can
   be sent at most once per India calendar day, even when no CRM browser is open.

2. New Tables
   - `public.irfan_task_alerts`
     - `alert_date` (date, primary key): the India calendar date of the alert.
     - `task_count` (integer): number of pending tasks included in the email.
     - `sent_at` (timestamptz): time the provider accepted the email.

3. Security
   - RLS is enabled.
   - No anon or authenticated policies are added because this table is only
     accessed by the server-side scheduled edge function using the service role.
   - The browser has no read or write access to alert history.

4. Important Notes
   - No task rows are changed.
   - The primary key makes duplicate daily alert records impossible.
   - The edge function claims the date before sending, so retries cannot send
     multiple emails for the same day.
*/

CREATE TABLE IF NOT EXISTS public.irfan_task_alerts (
  alert_date date PRIMARY KEY,
  task_count integer NOT NULL CHECK (task_count >= 0),
  sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.irfan_task_alerts ENABLE ROW LEVEL SECURITY;
