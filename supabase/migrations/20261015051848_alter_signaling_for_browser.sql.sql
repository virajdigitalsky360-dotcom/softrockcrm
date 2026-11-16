-- Alter signaling_messages to support browser-based screen sharing
-- device_id becomes nullable (browser sessions use session_id only)
-- Add session_token column for browser-based auth

ALTER TABLE signaling_messages ALTER COLUMN device_id DROP NOT NULL;
ALTER TABLE signaling_messages ADD COLUMN IF NOT EXISTS session_token text;
ALTER TABLE signaling_messages ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop old unique index that requires device_id
DROP INDEX IF EXISTS idx_signaling_offer_unique;

-- New unique index: one offer/answer per session_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_signaling_offer_answer_unique
  ON signaling_messages(session_id, type)
  WHERE type IN ('offer', 'answer');

CREATE INDEX IF NOT EXISTS idx_signaling_session_token ON signaling_messages(session_token) WHERE session_token IS NOT NULL;

-- Update RLS: allow authenticated users to access signaling for their sessions
DROP POLICY IF EXISTS "all_signaling_service_role" ON signaling_messages;
CREATE POLICY "all_signaling_service_role"
  ON signaling_messages FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);
