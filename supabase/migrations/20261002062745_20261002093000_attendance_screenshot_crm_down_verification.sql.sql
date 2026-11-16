/*
# Attendance System Update: Screenshot, CRM-Down Verification, Storage

## Purpose
1. Add `screenshot_url` column to `absent_reason_submissions` for mandatory screenshot uploads
2. Add `crm_down_verified` column to store CRM-down verification result
3. Add `verification_details` column for supporting system status info
4. Add `verification_timestamp` column for when verification was done
5. Create a storage bucket `absent-screenshots` for screenshot uploads
6. Add storage policies for the bucket (users can upload their own, masters can read all)

## Safety
- No existing columns are modified or deleted
- No existing data is changed
- All new columns are nullable so existing rows are unaffected
*/
ALTER TABLE absent_reason_submissions
  ADD COLUMN IF NOT EXISTS screenshot_url text,
  ADD COLUMN IF NOT EXISTS crm_down_verified text CHECK (crm_down_verified IN ('verified', 'not_verified', 'pending')),
  ADD COLUMN IF NOT EXISTS verification_details jsonb,
  ADD COLUMN IF NOT EXISTS verification_timestamp timestamptz;

-- Create storage bucket for absent screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('absent-screenshots', 'absent-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can upload their own screenshots, masters can read all
CREATE POLICY "absent_screenshots_upload_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'absent-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "absent_screenshots_read_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'absent-screenshots'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'master'
      )
    )
  );

CREATE POLICY "absent_screenshots_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'absent-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
