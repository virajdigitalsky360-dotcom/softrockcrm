/*
# Tighten screen_view_logs RLS to screen monitors only

## Purpose
The screen_view_logs table (audit log for screen viewing sessions) currently allows
any master to SELECT and INSERT. This should be restricted to only Viraj and Kapil
(screen monitors), matching the screen_share_sessions and signaling policies.

## Changes
- SELECT policy: `is_screen_monitor()` instead of `role = 'master'`
- INSERT policy: `is_screen_monitor()` instead of `role = 'master'`

## Security
- RLS remains ENABLED.
- Only Viraj and Kapil can read or write screen view audit logs.
- No data is modified or deleted.
*/
--

DROP POLICY IF EXISTS "select_view_logs_masters" ON public.screen_view_logs;
CREATE POLICY "select_view_logs_masters"
  ON public.screen_view_logs FOR SELECT
  TO authenticated
  USING (public.is_screen_monitor());

DROP POLICY IF EXISTS "insert_view_logs_masters" ON public.screen_view_logs;
CREATE POLICY "insert_view_logs_masters"
  ON public.screen_view_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_screen_monitor());
