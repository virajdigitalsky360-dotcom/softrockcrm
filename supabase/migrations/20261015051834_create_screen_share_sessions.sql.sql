-- Browser-based screen sharing sessions
-- Employees start sharing from their browser; Masters view via WebRTC

CREATE TABLE IF NOT EXISTS screen_share_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES team_members(id) ON DELETE SET NULL,
  employee_email text NOT NULL,
  employee_name text,
  status text NOT NULL DEFAULT 'sharing' CHECK (status IN ('sharing', 'stopped', 'failed')),
  session_token text UNIQUE NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_screen_share_sessions_status ON screen_share_sessions(status);
CREATE INDEX IF NOT EXISTS idx_screen_share_sessions_user ON screen_share_sessions(user_id);

ALTER TABLE screen_share_sessions ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can see which sessions are active (needed for master panel list)
DROP POLICY IF EXISTS "select_share_sessions_auth" ON screen_share_sessions;
CREATE POLICY "select_share_sessions_auth"
  ON screen_share_sessions FOR SELECT
  TO authenticated USING (true);

-- Users can insert their own sharing session
DROP POLICY IF EXISTS "insert_own_share_session" ON screen_share_sessions;
CREATE POLICY "insert_own_share_session"
  ON screen_share_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own session (heartbeat, stop)
DROP POLICY IF EXISTS "update_own_share_session" ON screen_share_sessions;
CREATE POLICY "update_own_share_session"
  ON screen_share_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Masters can update any session (to mark stopped on view end)
DROP POLICY IF EXISTS "update_share_sessions_master" ON screen_share_sessions;
CREATE POLICY "update_share_sessions_master"
  ON screen_share_sessions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'master')
  );

-- Users can delete their own session
DROP POLICY IF EXISTS "delete_own_share_session" ON screen_share_sessions;
CREATE POLICY "delete_own_share_session"
  ON screen_share_sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Masters can delete any session
DROP POLICY IF EXISTS "delete_share_sessions_master" ON screen_share_sessions;
CREATE POLICY "delete_share_sessions_master"
  ON screen_share_sessions FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'master')
  );
