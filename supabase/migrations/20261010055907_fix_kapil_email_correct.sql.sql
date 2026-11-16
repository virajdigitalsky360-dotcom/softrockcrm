-- Fix Kapil's email in attendance report RLS and storage policies
-- The correct email is kapilprajapati9054@gmail.com (without "raj")
-- Previous migration 20261006095446 incorrectly used kapilrajprajapati9054@gmail.com

-- Fix table RLS policies
DROP POLICY IF EXISTS "masters_select_attendance_reports" ON monthly_attendance_reports;
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

DROP POLICY IF EXISTS "masters_insert_attendance_reports" ON monthly_attendance_reports;
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

DROP POLICY IF EXISTS "masters_update_attendance_reports" ON monthly_attendance_reports;
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

DROP POLICY IF EXISTS "masters_delete_attendance_reports" ON monthly_attendance_reports;
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
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilprajapati9054@gmail.com')
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
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilprajapati9054@gmail.com')
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
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilprajapati9054@gmail.com')
  )
)
WITH CHECK (
  bucket_id = 'attendance-reports'
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilprajapati9054@gmail.com')
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
    AND p.email IN ('viraj.digitalsky360@gmail.com', 'kapilprajapati9054@gmail.com')
  )
);
