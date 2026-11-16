/*
# Add 'present' and 'excused' attendance statuses

The 11 AM task-based attendance system needs:
- 'present' — employee has at least 1 task for today
- 'excused' — Viraj manually overrides an ABSENT to EXCUSED

Also add 'override_reason' column to store the manual override reason/note
separately from the auto-generated notes, and 'overridden_by' / 'overridden_at'
to track who made the manual change and when.
*/

-- 1. Add new statuses to the constraint
ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_status_check;

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_status_check
  CHECK (status IN ('on_time', 'late', 'half_day', 'absent', 'leave', 'present', 'excused'));

-- 2. Add override tracking columns
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS override_reason text;

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS overridden_by uuid;

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS overridden_at timestamp with time zone;
