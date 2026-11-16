/*
# Desktop Notifications Dispatch Table

Cross-device browser notification system. Any logged-in browser can insert
notification rows; all browsers receive them via Supabase Realtime and fire
the actual Notification API call when recipient_email matches their user.

Used by:
  - Inactivity checker (task_owner + team_monitor notifications)
  - Test button (test_owner + test_monitor notifications)

RLS: all authenticated users can SELECT (realtime) and INSERT (dispatch).
Master can DELETE for cleanup.
*/

CREATE TABLE IF NOT EXISTS public.desktop_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  notification_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  task_id text,
  notification_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_key)
);

ALTER TABLE public.desktop_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_desktop_notifications_authenticated" ON public.desktop_notifications;
CREATE POLICY "select_desktop_notifications_authenticated"
  ON public.desktop_notifications FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_desktop_notifications_authenticated" ON public.desktop_notifications;
CREATE POLICY "insert_desktop_notifications_authenticated"
  ON public.desktop_notifications FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "delete_desktop_notifications_master" ON public.desktop_notifications;
CREATE POLICY "delete_desktop_notifications_master"
  ON public.desktop_notifications FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'master')
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.desktop_notifications;
