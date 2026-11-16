/*
# Add verification tracking columns to absent_reason_submissions

1. New Columns
- `arrival_time` (text, nullable) — the "In"/office arrival time shown on the employee's screenshot, entered by the employee
- `verified_by` (uuid, nullable, references auth.users) — the Master user who verified the proof
- `verified_at` (timestamptz, nullable) — when the Master verified the proof
- `verification_note` (text, nullable) — optional note from the Master about the verification

2. Purpose
- When an employee submits an absent reason with a screenshot, they can enter the arrival time shown on the screenshot.
- The attendance status stays ABSENT — it is NOT automatically changed to PRESENT.
- A Master (Viraj/Kapil) reviews the submission, sees the screenshot and arrival time, and manually verifies it.
- Only after manual verification can a Master change ABSENT → PRESENT or EXCUSED.
- This records who verified, when, and any note.

3. Security
- No RLS policy changes — existing policies on absent_reason_submissions remain unchanged.
- Masters already have read access via their role; the new columns are covered by existing policies.
*/
ALTER TABLE public.absent_reason_submissions
  ADD COLUMN IF NOT EXISTS arrival_time text,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_note text;
