-- Audit log for administrative actions performed from the Master Control Center.
-- Only Viraj Primary Master can perform these actions; the log records who did what, when, and the target.
CREATE TABLE IF NOT EXISTS master_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_email text,
  action text NOT NULL,
  target_type text,
  target_id text,
  target_label text,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_master_audit_log_created_at ON master_audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_master_audit_log_performed_by ON master_audit_log (performed_by);

ALTER TABLE master_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_master_audit_log" ON master_audit_log;
CREATE POLICY "select_master_audit_log"
  ON master_audit_log FOR SELECT
  TO authenticated
  USING (
    auth.uid() = performed_by
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'master')
  );

DROP POLICY IF EXISTS "insert_master_audit_log" ON master_audit_log;
CREATE POLICY "insert_master_audit_log"
  ON master_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = performed_by
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.email = 'viraj.digitalsky360@gmail.com')
  );
