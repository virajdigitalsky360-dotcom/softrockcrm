/*
# Monthly Attendance Report Uploads

## Purpose
Store uploaded monthly attendance report files and their parsed/calculated
summary data. Only Viraj Primary Master can upload, view, or manage these
reports. Existing attendance_records are NOT modified — this is a separate
read-only archive of uploaded reports.

## New Tables

### `monthly_attendance_reports`
- `id` (uuid, primary key)
- `uploaded_by` (uuid, references auth.users — the user who uploaded)
- `file_name` (text — original filename from the user's PC)
- `file_type` (text — detected type: txt, csv, xlsx, pdf)
- `file_size` (bigint — file size in bytes)
- `storage_path` (text — path in the `attendance-reports` storage bucket)
- `report_month` (text — detected month, e.g. "2026-09", nullable if unparseable)
- `summary` (jsonb — calculated totals: overall present/absent/excused counts,
  per-employee totals, attendance percentages, needs-review rows)
- `raw_parsed` (jsonb — the raw parsed rows from the file, for audit)
- `status` (text — 'parsed' or 'needs_review' or 'error')
- `created_at` (timestamptz)

## Security
- RLS enabled on `monthly_attendance_reports`.
- Only Viraj (checked via profiles.email) can SELECT, INSERT, UPDATE, DELETE.
- No `anon` access. No other role can read these reports.

## Storage
- Uses the `attendance-reports` storage bucket (private).
- Only Viraj can upload/read files in this bucket.
*/

CREATE TABLE IF NOT EXISTS monthly_attendance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  storage_path text,
  report_month text,
  summary jsonb,
  raw_parsed jsonb,
  status text NOT NULL DEFAULT 'parsed',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE monthly_attendance_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "viraj_select_attendance_reports" ON monthly_attendance_reports;
CREATE POLICY "viraj_select_attendance_reports"
ON monthly_attendance_reports FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email = 'viraj.digitalsky360@gmail.com'
  )
);

DROP POLICY IF EXISTS "viraj_insert_attendance_reports" ON monthly_attendance_reports;
CREATE POLICY "viraj_insert_attendance_reports"
ON monthly_attendance_reports FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email = 'viraj.digitalsky360@gmail.com'
  )
);

DROP POLICY IF EXISTS "viraj_update_attendance_reports" ON monthly_attendance_reports;
CREATE POLICY "viraj_update_attendance_reports"
ON monthly_attendance_reports FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email = 'viraj.digitalsky360@gmail.com'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email = 'viraj.digitalsky360@gmail.com'
  )
);

DROP POLICY IF EXISTS "viraj_delete_attendance_reports" ON monthly_attendance_reports;
CREATE POLICY "viraj_delete_attendance_reports"
ON monthly_attendance_reports FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.email = 'viraj.digitalsky360@gmail.com'
  )
);
