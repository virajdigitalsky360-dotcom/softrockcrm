-- Signaling messages table for WebRTC screen monitoring
CREATE TABLE IF NOT EXISTS signaling_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES monitored_devices(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('viewer', 'streamer')),
  type text NOT NULL CHECK (type IN ('offer', 'answer', 'ice')),
  sdp text NOT NULL,
  ice_sdp_mid text,
  ice_sdp_mline_index integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_signaling_offer_unique
  ON signaling_messages(device_id, session_id, type)
  WHERE type IN ('offer', 'answer');

CREATE INDEX IF NOT EXISTS idx_signaling_session ON signaling_messages(device_id, session_id, type, role);
CREATE INDEX IF NOT EXISTS idx_signaling_created ON signaling_messages(created_at);

ALTER TABLE signaling_messages ENABLE ROW LEVEL SECURITY;

-- Only the service role (edge functions) can access signaling messages
DROP POLICY IF EXISTS "all_signaling_service_role" ON signaling_messages;
CREATE POLICY "all_signaling_service_role"
  ON signaling_messages FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- Auto-cleanup old signaling messages (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_old_signaling_messages()
RETURNS void AS $$
BEGIN
  DELETE FROM signaling_messages WHERE created_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql;
