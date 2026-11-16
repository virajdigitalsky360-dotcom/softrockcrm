/*
# Allow Kapil Master to Access Monthly Attendance Reports

## Purpose
Previously only Viraj (Primary Master) could upload, import, view, and delete
monthly attendance reports. Now Kapil (Master) also needs full access to the
same features. Normal team members remain blocked.

## Changes
- All 4 RLS policies on `monthly_attendance_reports` are replaced to check
  for BOTH Viraj's email AND Kapil's email in the profiles table.
- No new tables, no new columns, no changes to existing attendance records.
- Kapil's email: kapilprajapati9054@gmail.com
- Viraj's email: viraj.digitalsky360@gmail.com

## Security
- RLS remains enabled.
- Only Viraj and Kapil (checked via profiles.email + auth.uid()) can
  SELECT, INSERT, UPDATE, DELETE.
- No anon access. No other authenticated user can access these reports.
*/

DROP POLICY IF EXISTS "viraj_select_attendance_reports" ON monthly_attendance_reports;
CREATE POLICY "masters_select_attendance_reports"
ON monthly_attendance_reports FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilprajapati9054@gmail.com')
  )
);

DROP POLICY IF EXISTS "viraj_insert_attendance_reports" ON monthly_attendance_reports;
CREATE POLICY "masters_insert_attendance_reports"
ON monthly_attendance_reports FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilprajapati9054@gmail.com')
  )
);

DROP POLICY IF EXISTS "viraj_update_attendance_reports" ON monthly_attendance_reports;
CREATE POLICY "masters_update_attendance_reports"
ON monthly_attendance_reports FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilprajapati9054@gmail.com')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilprajapati9054@gmail.com')
  )
);

DROP POLICY IF EXISTS "viraj_delete_attendance_reports" ON monthly_attendance_reports;
CREATE POLICY "masters_delete_attendance_reports"
ON monthly_attendance_reports FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilprajapati9054@gmail.com')
  )
);
