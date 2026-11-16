/*
# Test desktop notification bridge table

Used by Viraj to trigger a real browser/desktop notification on Kapil's device.
Viraj inserts a row; Kapil's browser (subscribed via Supabase Realtime) fires
the actual Notification API call on his device.

No other team members receive this notification.
*/

CREATE TABLE IF NOT EXISTS public.test_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by_email text NOT NULL,
  triggered_by_name text,
  title text NOT NULL DEFAULT 'SOFTROCK Notification Test',
  message text NOT NULL,
  delivered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.test_notifications ENABLE ROW LEVEL SECURITY;

-- Only Viraj can insert test notifications
DROP POLICY IF EXISTS "insert_test_notifications_viraj" ON public.test_notifications;
CREATE POLICY "insert_test_notifications_viraj" ON public.test_notifications
  FOR INSERT TO authenticated
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'viraj.digitalsky360@gmail.com');

-- Viraj and Kapil can read test notifications (needed for realtime subscription)
DROP POLICY IF EXISTS "select_test_notifications_masters" ON public.test_notifications;
CREATE POLICY "select_test_notifications_masters" ON public.test_notifications
  FOR SELECT TO authenticated
  USING (
    lower(auth.jwt() ->> 'email') IN ('viraj.digitalsky360@gmail.com', 'kapilprajapati9054@gmail.com')
  );

-- Only Kapil can mark as delivered (his browser updates the row)
DROP POLICY IF EXISTS "update_test_notifications_kapil" ON public.test_notifications;
CREATE POLICY "update_test_notifications_kapil" ON public.test_notifications
  FOR UPDATE TO authenticated
  USING (lower(auth.jwt() ->> 'email') = 'kapilprajapati9054@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'kapilprajapati9054@gmail.com');

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.test_notifications;
