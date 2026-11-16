/*
# Fix Kapil's Email in Attendance Report RLS and Storage Policies

## Purpose
The previous migrations that granted Viraj and Kapil access to monthly
attendance reports used an incorrect email for Kapil:
  kapilprajapati9054@gmail.com  (WRONG)
  kapilrajprajapati9054@gmail.com  (CORRECT)

This migration replaces all 4 RLS policies on monthly_attendance_reports
and all 4 storage policies on storage.objects for the attendance-reports
bucket with versions that use the correct email.

## Changes
- RLS policies on monthly_attendance_reports: updated to use
  'kapilrajprajapati9054@gmail.com'.
- Storage policies on storage.objects for bucket 'attendance-reports':
  updated to use 'kapilrajprajapati9054@gmail.com'.
- No new tables, no new columns, no data changes.
*/

-- Fix table RLS policies
DROP POLICY IF EXISTS "masters_select_attendance_reports" ON monthly_attendance_reports;
CREATE POLICY "masters_select_attendance_reports"
ON monthly_attendance_reports FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilrajprajapati9054@gmail.com')
  )
);

DROP POLICY IF EXISTS "masters_insert_attendance_reports" ON monthly_attendance_reports;
CREATE POLICY "masters_insert_attendance_reports"
ON monthly_attendance_reports FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilrajprajapati9054@gmail.com')
  )
);

DROP POLICY IF EXISTS "masters_update_attendance_reports" ON monthly_attendance_reports;
CREATE POLICY "masters_update_attendance_reports"
ON monthly_attendance_reports FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilrajprajapati9054@gmail.com')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilrajprajapati9054@gmail.com')
  )
);

DROP POLICY IF EXISTS "masters_delete_attendance_reports" ON monthly_attendance_reports;
CREATE POLICY "masters_delete_attendance_reports"
ON monthly_attendance_reports FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilrajprajapati9054@gmail.com')
  )
);

-- Fix storage policies
DROP POLICY IF EXISTS "attendance_reports_masters_read" ON storage.objects;
CREATE POLICY "attendance_reports_masters_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'attendance-reports'
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilrajprajapati9054@gmail.com')
  )
);

DROP POLICY IF EXISTS "attendance_reports_masters_upload" ON storage.objects;
CREATE POLICY "attendance_reports_masters_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'attendance-reports'
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilrajprajapati9054@gmail.com')
  )
);

DROP POLICY IF EXISTS "attendance_reports_masters_update" ON storage.objects;
CREATE POLICY "attendance_reports_masters_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'attendance-reports'
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilrajprajapati9054@gmail.com')
  )
)
WITH CHECK (
  bucket_id = 'attendance-reports'
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilrajprajapati9054@gmail.com')
  )
);

DROP POLICY IF EXISTS "attendance_reports_masters_delete" ON storage.objects;
CREATE POLICY "attendance_reports_masters_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'attendance-reports'
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilrajprajapati9054@gmail.com')
  )
);
