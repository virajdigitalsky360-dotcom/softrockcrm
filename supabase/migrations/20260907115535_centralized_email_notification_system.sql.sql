/*
# Centralized Email Notification System

## Summary
Creates a unified email notification settings table that lets the Master user
enable/disable email notifications per team member and select which notification
types each member receives. All emails will use a single RESEND_API_KEY stored
in Supabase Edge Function Secrets — no per-user API keys needed.

## New Tables

### email_notification_settings
Per-team-member email notification configuration.
- `id` (uuid, primary key)
- `team_member_id` (uuid, foreign key to team_members.id, unique) — which team member this config belongs to
- `email_enabled` (boolean, default true) — master toggle: can this person receive any emails?
- `notify_pending_tasks` (boolean, default true) — daily 6 PM pending task report
- `notify_leave_events` (boolean, default true) — leave created/approved/rejected notifications
- `notify_inactivity` (boolean, default false) — task inactivity alerts (reserved for future)
- `updated_at` (timestamptz) — last modification time
- `updated_by` (uuid, nullable) — profile id of who last changed this setting

### centralized_email_logs
Unified log for every email sent through the centralized system.
- `id` (uuid, primary key)
- `recipient_email` (text, not null) — the email address the message was sent to
- `team_member_id` (uuid, nullable) — associated team member if applicable
- `notification_type` (text, not null) — one of: pending_tasks, leave_event, inactivity, test
- `subject` (text) — email subject line
- `status` (text, not null) — 'sent' or 'failed'
- `error_message` (text, nullable) — error details on failure
- `resend_message_id` (text, nullable) — Resend API message ID on success
- `triggered_by` (text, not null) — 'cron' or 'manual'
- `created_at` (timestamptz, default now()) — timestamp of the attempt

## Security
- RLS enabled on both new tables.
- Only authenticated users can read email_notification_settings.
- Only master role users can modify email_notification_settings (enforced via app-level checks + RLS).
- All authenticated users can read centralized_email_logs (for transparency).
- Only master role users can delete log entries.
- No changes to existing tables, users, RLS, or permissions.

## Important Notes
1. Existing per-user Resend API keys (RESEND_API_KEY_KAPIL, RESEND_API_KEY_ROSTAN) are no longer
   needed for new emails. All edge functions will use the single RESEND_API_KEY.
2. Existing email log tables (irfan_email_logs, rostan_email_logs, team_email_logs, leave_email_logs)
   remain untouched — they still contain historical data.
3. Default settings seed all existing team members with all notification types enabled.
4. Rostan's email remains softrockind@gmail.com — no user data is changed.
*/

-- ============================================================
-- email_notification_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS email_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid UNIQUE NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT true,
  notify_pending_tasks boolean NOT NULL DEFAULT true,
  notify_leave_events boolean NOT NULL DEFAULT true,
  notify_inactivity boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE email_notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_email_notif_settings_authenticated" ON email_notification_settings;
CREATE POLICY "select_email_notif_settings_authenticated"
  ON email_notification_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_email_notif_settings_master" ON email_notification_settings;
CREATE POLICY "insert_email_notif_settings_master"
  ON email_notification_settings FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'master')
  );

DROP POLICY IF EXISTS "update_email_notif_settings_master" ON email_notification_settings;
CREATE POLICY "update_email_notif_settings_master"
  ON email_notification_settings FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'master')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'master')
  );

DROP POLICY IF EXISTS "delete_email_notif_settings_master" ON email_notification_settings;
CREATE POLICY "delete_email_notif_settings_master"
  ON email_notification_settings FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'master')
  );

-- ============================================================
-- centralized_email_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS centralized_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  team_member_id uuid REFERENCES team_members(id) ON DELETE SET NULL,
  notification_type text NOT NULL,
  subject text,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  resend_message_id text,
  triggered_by text NOT NULL DEFAULT 'cron',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE centralized_email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_centralized_email_logs_authenticated" ON centralized_email_logs;
CREATE POLICY "select_centralized_email_logs_authenticated"
  ON centralized_email_logs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_centralized_email_logs_service" ON centralized_email_logs;
CREATE POLICY "insert_centralized_email_logs_service"
  ON centralized_email_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "delete_centralized_email_logs_master" ON centralized_email_logs;
CREATE POLICY "delete_centralized_email_logs_master"
  ON centralized_email_logs FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'master')
  );

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_centralized_email_logs_created_at ON centralized_email_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_centralized_email_logs_recipient ON centralized_email_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_centralized_email_logs_type ON centralized_email_logs(notification_type);

-- ============================================================
-- Seed default settings for all existing team members
-- ============================================================
INSERT INTO email_notification_settings (team_member_id, email_enabled, notify_pending_tasks, notify_leave_events, notify_inactivity)
SELECT tm.id, true, true, true, false
FROM team_members tm
WHERE NOT EXISTS (
  SELECT 1 FROM email_notification_settings ens WHERE ens.team_member_id = tm.id
);
