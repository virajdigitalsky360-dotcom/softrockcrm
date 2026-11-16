/*
# Create absent_reason_submissions table

## Purpose
Starting 1 October 2026, employees marked ABSENT for today must submit a mandatory
reason before they can access the CRM. This table stores those submissions so we
can check whether an employee already submitted a reason for today (and skip the
lock if so), and so masters can review submitted reasons.

## New Tables
- `absent_reason_submissions`
  - `id` (uuid, primary key)
  - `user_id` (uuid, NOT NULL, references auth.users) — the employee who submitted
  - `team_member_id` (uuid, references team_members) — linked team member row
  - `attendance_date` (date, NOT NULL) — the IST date the submission is for
  - `submission_time` (timestamptz, NOT NULL, default now()) — when submitted
  - `reason` (text, NOT NULL) — one of: 'crm_down', 'no_task_assigned', 'forgot_to_add_task', 'other'
  - `explanation` (text) — free-text explanation from the employee
  - `created_at` (timestamptz, default now())

## Indexes
- Unique constraint on (user_id, attendance_date) so an employee can only submit
  one reason per day — re-submission attempts are rejected at the DB level.

## Security (RLS)
- RLS enabled.
- SELECT: authenticated users can read their own submissions; masters can read all.
- INSERT: authenticated users can insert their own submission (user_id defaults to auth.uid()).
- UPDATE/DELETE: masters only (for correction/management).
*/
CREATE TABLE IF NOT EXISTS absent_reason_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES team_members(id) ON DELETE SET NULL,
  attendance_date date NOT NULL,
  submission_time timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (reason IN ('crm_down', 'no_task_assigned', 'forgot_to_add_task', 'other')),
  explanation text,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_absent_reason_user_date
  ON absent_reason_submissions (user_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_absent_reason_date
  ON absent_reason_submissions (attendance_date);

ALTER TABLE absent_reason_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_absent_submissions" ON absent_reason_submissions;
CREATE POLICY "select_own_absent_submissions"
  ON absent_reason_submissions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'master'));

DROP POLICY IF EXISTS "insert_own_absent_submission" ON absent_reason_submissions;
CREATE POLICY "insert_own_absent_submission"
  ON absent_reason_submissions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_absent_submission_master" ON absent_reason_submissions;
CREATE POLICY "update_absent_submission_master"
  ON absent_reason_submissions FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'master'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'master'));

DROP POLICY IF EXISTS "delete_absent_submission_master" ON absent_reason_submissions;
CREATE POLICY "delete_absent_submission_master"
  ON absent_reason_submissions FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'master'));
