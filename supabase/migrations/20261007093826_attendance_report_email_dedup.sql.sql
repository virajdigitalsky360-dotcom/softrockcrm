-- Create a dedup table for attendance report emails so the same date
-- never receives a duplicate combined report email.
CREATE TABLE IF NOT EXISTS attendance_report_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  absent_count integer NOT NULL DEFAULT 0,
  present_count integer NOT NULL DEFAULT 0,
  excused_count integer NOT NULL DEFAULT 0,
  recipients text[] NOT NULL,
  triggered_by text NOT NULL DEFAULT 'cron'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_report_email_log_date
  ON attendance_report_email_log (report_date);

ALTER TABLE attendance_report_email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_attendance_report_email_log_master" ON attendance_report_email_log;
CREATE POLICY "select_attendance_report_email_log_master"
  ON attendance_report_email_log FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'master'));

DROP POLICY IF EXISTS "insert_attendance_report_email_log_service" ON attendance_report_email_log;
CREATE POLICY "insert_attendance_report_email_log_service"
  ON attendance_report_email_log FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
