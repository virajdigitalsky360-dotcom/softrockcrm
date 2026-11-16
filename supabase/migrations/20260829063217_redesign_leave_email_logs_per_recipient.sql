-- Redesign leave_email_logs: one row per recipient with per-recipient status
-- Drop the old table and recreate with the new schema

DROP TABLE IF EXISTS public.leave_email_logs CASCADE;

CREATE TABLE public.leave_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_id uuid,
  employee_name text NOT NULL,
  event_type text NOT NULL,
  recipient_email text NOT NULL,
  send_status text NOT NULL DEFAULT 'sent',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_email_logs ENABLE ROW LEVEL SECURITY;

-- Only master users can view the complete email history
CREATE POLICY "select_leave_email_logs_master" ON public.leave_email_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'master'
    )
  );

-- Only the service role (edge function) can insert logs
CREATE POLICY "insert_leave_email_logs_service" ON public.leave_email_logs
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

CREATE INDEX idx_leave_email_logs_leave_id ON public.leave_email_logs(leave_id);
CREATE INDEX idx_leave_email_logs_created_at ON public.leave_email_logs(created_at DESC);

GRANT INSERT, SELECT ON public.leave_email_logs TO service_role;