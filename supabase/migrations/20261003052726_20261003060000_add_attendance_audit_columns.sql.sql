/*
# Add audit/debug columns to attendance_records

1. New Columns
- `check_timestamp` (timestamptz, nullable) — the exact UTC timestamp when the 10:40 AM attendance check ran for this employee
- `task_count_at_check` (integer, nullable) — the number of tasks found for this employee at check time
- `task_ids_at_check` (text[], nullable) — the UUIDs of the tasks counted at check time
- `team_member_ids_checked` (text[], nullable) — all team_member IDs checked for this person (they may have multiple rows across workspaces, grouped by email)

2. Purpose
- When the 10:40 AM attendance edge function marks someone absent or present, it records exactly what it found:
  - When it ran (check_timestamp)
  - How many tasks it counted (task_count_at_check)
  - Which task IDs were counted (task_ids_at_check)
  - Which team_member IDs were queried (team_member_ids_checked)
- This lets Masters compare the task count at check time vs. the current task count shown in the CRM,
  and determine whether tasks existed before 10:40 AM or were created after.

3. Security
- No RLS changes — existing policies cover the new columns.
*/
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS check_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS task_count_at_check integer,
  ADD COLUMN IF NOT EXISTS task_ids_at_check text[],
  ADD COLUMN IF NOT EXISTS team_member_ids_checked text[];
