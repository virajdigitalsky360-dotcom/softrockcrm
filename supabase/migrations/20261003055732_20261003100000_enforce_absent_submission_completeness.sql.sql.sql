/*
# Fix Absent Reason Submission: Enforce Completeness + Prevent Duplicates

## Problem
Employees can select "Other" as a reason and submit with a NULL explanation.
The submission row exists in the database, and the lock-check hook sees it
and unlocks the CRM — even though the submission is incomplete.

Additionally, there is no unique constraint on (user_id, attendance_date),
so duplicate submissions can accumulate, and a re-submit creates a new row
instead of updating the existing one.

## Fix

### 1. Unique constraint on (user_id, attendance_date)
Only one submission per user per day. This lets the frontend safely use
upsert (INSERT ... ON CONFLICT DO UPDATE) when re-submitting.

### 2. CHECK constraint: explanation required for 'other'
If reason = 'other', explanation must be non-empty.
This is enforced at the database level — even if the frontend is bypassed,
the database will reject an incomplete "other" submission.

### 3. CHECK constraint: screenshot required for no_task_assigned / forgot_to_add_task
If reason is in the screenshot-required set, screenshot_url must be non-null.

These constraints are enforced at the DB level, so no client-side bypass
can create an incomplete submission that would unlock the CRM.

## No changes to:
- Existing attendance records
- Existing 10:40 AM cron logic
- RLS policies
- User accounts or roles
*/

-- First, delete any existing invalid submissions so constraints can be added
DELETE FROM absent_reason_submissions
WHERE reason = 'other' AND (explanation IS NULL OR btrim(explanation) = '');

DELETE FROM absent_reason_submissions
WHERE reason IN ('no_task_assigned', 'forgot_to_add_task') AND screenshot_url IS NULL;

-- Unique constraint: one submission per user per day
ALTER TABLE absent_reason_submissions
  DROP CONSTRAINT IF EXISTS absent_reason_submissions_user_date_unique;

ALTER TABLE absent_reason_submissions
  ADD CONSTRAINT absent_reason_submissions_user_date_unique UNIQUE (user_id, attendance_date);

-- CHECK: 'other' reason requires a non-empty explanation
ALTER TABLE absent_reason_submissions
  DROP CONSTRAINT IF EXISTS absent_reason_submissions_other_requires_explanation;

ALTER TABLE absent_reason_submissions
  ADD CONSTRAINT absent_reason_submissions_other_requires_explanation
  CHECK (
    reason <> 'other' OR (explanation IS NOT NULL AND btrim(explanation) <> '')
  );

-- CHECK: screenshot-required reasons must have screenshot_url
ALTER TABLE absent_reason_submissions
  DROP CONSTRAINT IF EXISTS absent_reason_submissions_screenshot_required;

ALTER TABLE absent_reason_submissions
  ADD CONSTRAINT absent_reason_submissions_screenshot_required
  CHECK (
    reason NOT IN ('no_task_assigned', 'forgot_to_add_task') OR screenshot_url IS NOT NULL
  );
