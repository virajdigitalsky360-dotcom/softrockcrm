-- Team Screen Monitoring system
-- Tracks company devices, their connection status, and screen viewing audit logs

CREATE TABLE IF NOT EXISTS monitored_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid REFERENCES team_members(id) ON DELETE CASCADE,
  device_name text NOT NULL DEFAULT 'Company Laptop',
  device_hostname text,
  device_token text UNIQUE NOT NULL,
  monitoring_enabled boolean NOT NULL DEFAULT true,
  consent_accepted boolean NOT NULL DEFAULT false,
  consent_accepted_at timestamptz,
  last_seen_at timestamptz,
  is_online boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monitored_devices_team_member ON monitored_devices(team_member_id);
CREATE INDEX IF NOT EXISTS idx_monitored_devices_token ON monitored_devices(device_token);

ALTER TABLE monitored_devices ENABLE ROW LEVEL SECURITY;

-- Masters can manage and view all devices
DROP POLICY IF EXISTS "select_devices_masters" ON monitored_devices;
CREATE POLICY "select_devices_masters"
  ON monitored_devices FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'master')
  );

DROP POLICY IF EXISTS "insert_devices_masters" ON monitored_devices;
CREATE POLICY "insert_devices_masters"
  ON monitored_devices FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'master')
  );

DROP POLICY IF EXISTS "update_devices_masters" ON monitored_devices;
CREATE POLICY "update_devices_masters"
  ON monitored_devices FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'master')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'master')
  );

DROP POLICY IF EXISTS "delete_devices_masters" ON monitored_devices;
CREATE POLICY "delete_devices_masters"
  ON monitored_devices FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'master')
  );

-- Screen view audit log
CREATE TABLE IF NOT EXISTS screen_view_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid REFERENCES monitored_devices(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES team_members(id) ON DELETE SET NULL,
  viewer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  viewer_email text,
  employee_name text,
  action text NOT NULL CHECK (action IN ('start_view', 'stop_view', 'view_session')),
  session_id text,
  started_at timestamptz,
  stopped_at timestamptz,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_screen_view_logs_device ON screen_view_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_screen_view_logs_viewer ON screen_view_logs(viewer_user_id);
CREATE INDEX IF NOT EXISTS idx_screen_view_logs_created ON screen_view_logs(created_at DESC);

ALTER TABLE screen_view_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_view_logs_masters" ON screen_view_logs;
CREATE POLICY "select_view_logs_masters"
  ON screen_view_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'master')
  );

DROP POLICY IF EXISTS "insert_view_logs_masters" ON screen_view_logs;
CREATE POLICY "insert_view_logs_masters"
  ON screen_view_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'master')
  );

-- updated_at trigger for monitored_devices
CREATE OR REPLACE FUNCTION update_monitored_devices_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_monitored_devices_updated_at ON monitored_devices;
CREATE TRIGGER trg_monitored_devices_updated_at
  BEFORE UPDATE ON monitored_devices
  FOR EACH ROW
  EXECUTE FUNCTION update_monitored_devices_updated_at();
