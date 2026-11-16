/*
# Add due_time column to tasks

## Summary
Adds an optional `due_time` column to the `tasks` table so tasks can have
a specific scheduled time (e.g. "20:00" for 8:00 PM). This does NOT change
how `due_date` works — it remains a `date` column used for date-based
filtering. The date filter continues to match on `due_date` only, so all
tasks for a given date appear regardless of their scheduled time.

## Changes
- `tasks.due_time` — new nullable `time` column. NULL means no specific
  time is set (task is just date-scheduled). Values are stored in 24-hour
  format (HH:MM:SS).

## Security
- No RLS policy changes. No permission changes. No role changes.
- The new column is covered by existing task SELECT/INSERT/UPDATE policies
  since those use the table-level policy, not column-level privileges.
*/
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS due_time time;
