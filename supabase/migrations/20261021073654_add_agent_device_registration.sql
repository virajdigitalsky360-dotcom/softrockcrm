/*
# Add monitoring device registration for Python agent

## Purpose
Enables the existing Python screen monitoring agent (agent/screen_agent.py) to
register and stream Irfan's desktop screen automatically — without requiring
a manual "Share My Screen" click. The agent authenticates with a device token
instead of a Supabase JWT, since it runs as a desktop process, not a browser.

## Changes

### 1. New Table: `monitoring_devices`
Stores registered monitoring devices (Python agents). Each device has:
- `id` — UUID primary key
- `device_token` — unique secret token used by the agent to authenticate
- `team_member_id` — links to the employee being monitored (FK → team_members)
- `user_id` — the CRM user this device belongs to (FK → profiles)
- `device_name` — human-readable label (e.g. "Irfan's Laptop")
- `status` — 'online' | 'offline'
- `last_heartbeat_at` — timestamp of last agent heartbeat
- `created_by` — the master who registered this device
- `created_at` — registration timestamp

### 2. RLS on `monitoring_devices`
- SELECT / INSERT / UPDATE / DELETE: only screen monitors (Viraj + Kapil)

### 3. Updated `screen_share_sessions`
- Added `device_id` column (nullable FK → monitoring_devices)
- Added `source` column ('browser' | 'agent') to distinguish session origin

## Security
- Device tokens are unique UUIDs, not guessable.
- Only screen monitors (Viraj + Kapil) can register/manage devices.
- The agent can only create sessions for the user it's registered to.
- All viewing is still logged in `screen_view_logs`.
- Viraj and Kapil can never have devices registered (enforced in edge function).
*/

-- ============================================================
-- 1. Create monitoring_devices table
-- ============================================================
CREATE TABLE IF NOT EXISTS monitoring_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_token text UNIQUE NOT NULL,
  team_member_id uuid REFERENCES team_members(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_name text NOT NULL DEFAULT 'Desktop Agent',
  status text NOT NULL DEFAULT 'offline',
  last_heartbeat_at timestamptz,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE monitoring_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_monitoring_devices_screen_monitors" ON monitoring_devices;
CREATE POLICY "select_monitoring_devices_screen_monitors"
  ON monitoring_devices FOR SELECT
  TO authenticated
  USING (is_screen_monitor());

DROP POLICY IF EXISTS "insert_monitoring_devices_screen_monitors" ON monitoring_devices;
CREATE POLICY "insert_monitoring_devices_screen_monitors"
  ON monitoring_devices FOR INSERT
  TO authenticated
  WITH CHECK (is_screen_monitor());

DROP POLICY IF EXISTS "update_monitoring_devices_screen_monitors" ON monitoring_devices;
CREATE POLICY "update_monitoring_devices_screen_monitors"
  ON monitoring_devices FOR UPDATE
  TO authenticated
  USING (is_screen_monitor())
  WITH CHECK (is_screen_monitor());

DROP POLICY IF EXISTS "delete_monitoring_devices_screen_monitors" ON monitoring_devices;
CREATE POLICY "delete_monitoring_devices_screen_monitors"
  ON monitoring_devices FOR DELETE
  TO authenticated
  USING (is_screen_monitor());

-- ============================================================
-- 2. Add device_id and source to screen_share_sessions
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'screen_share_sessions' AND column_name = 'device_id'
  ) THEN
    ALTER TABLE screen_share_sessions ADD COLUMN device_id uuid REFERENCES monitoring_devices(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'screen_share_sessions' AND column_name = 'source'
  ) THEN
    ALTER TABLE screen_share_sessions ADD COLUMN source text NOT NULL DEFAULT 'browser';
  END IF;
END $$;
