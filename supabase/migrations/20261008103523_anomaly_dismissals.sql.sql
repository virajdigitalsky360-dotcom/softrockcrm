CREATE TABLE IF NOT EXISTS anomaly_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_key text NOT NULL UNIQUE,
  anomaly_type text NOT NULL,
  employee_name text,
  task_name text,
  risk_level text NOT NULL DEFAULT 'info',
  description text,
  evidence text,
  first_detected timestamptz NOT NULL DEFAULT now(),
  last_detected timestamptz NOT NULL DEFAULT now(),
  dismissed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  dismissed_by_email text,
  dismissed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_dismissals_key ON anomaly_dismissals (anomaly_key);

ALTER TABLE anomaly_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_anomaly_dismissals" ON anomaly_dismissals;
CREATE POLICY "select_anomaly_dismissals"
  ON anomaly_dismissals FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.email = 'viraj.digitalsky360@gmail.com'));

DROP POLICY IF EXISTS "insert_anomaly_dismissals" ON anomaly_dismissals;
CREATE POLICY "insert_anomaly_dismissals"
  ON anomaly_dismissals FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.email = 'viraj.digitalsky360@gmail.com'));
