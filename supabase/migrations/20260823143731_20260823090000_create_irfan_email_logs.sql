/*
# Irfan Email Notification Log

1. Overview
   Creates a log table for every Irfan pending-task email sent (both the
   automatic 7 PM cron and the manual "Send Pending Email Now" button).
   Each row records recipients, send timestamp, task count, task details,
   and delivery status.

2. New Tables
   - `public.irfan_email_logs`
     - `id` (uuid, primary key)
     - `recipients` (text[]): email addresses the message was sent to
     - `task_count` (integer): number of pending tasks included
     - `task_details` (jsonb): array of task name/client/person/status/due/notes
     - `status` (text): 'sent' or 'failed'
     - `error_message` (text): null on success, error text on failure
     - `triggered_by` (text): 'cron' or 'manual'
     - `sent_at` (timestamptz): when the attempt completed

3. Security
   - RLS enabled, no policies: only the service role (edge function) can
     read or write. The browser cannot access this table directly.
   - No existing tables, policies, or data are changed.
*/

CREATE TABLE IF NOT EXISTS public.irfan_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipients text[] NOT NULL,
  task_count integer NOT NULL DEFAULT 0,
  task_details jsonb,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed')),
  error_message text,
  triggered_by text NOT NULL DEFAULT 'cron' CHECK (triggered_by IN ('cron','manual')),
  sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.irfan_email_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS irfan_email_logs_sent_at_idx ON public.irfan_email_logs(sent_at DESC);
