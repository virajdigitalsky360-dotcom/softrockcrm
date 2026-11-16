/*
# Storage Policies for attendance-reports Bucket

## Purpose
The attendance-reports storage bucket stores uploaded monthly attendance
report files. Previously there were no RLS policies on storage.objects for
this bucket, meaning no authenticated user could upload or read files
through the Supabase client (RLS is enabled on storage.objects).

## Changes
- Add SELECT, INSERT, DELETE, UPDATE policies on storage.objects for the
  'attendance-reports' bucket, scoped to Viraj and Kapil only.
- No changes to existing absent-screenshots policies.
- No changes to any other bucket.

## Security
- Only Viraj and Kapil (checked via profiles.email + auth.uid()) can
  upload, read, or delete files in the attendance-reports bucket.
- No anon access. No other authenticated user can access these files.
*/

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
