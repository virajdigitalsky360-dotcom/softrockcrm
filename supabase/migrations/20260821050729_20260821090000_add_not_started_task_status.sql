/*
# Expand task statuses to the five-status workflow

1. Overview
- Replaces the original three task statuses with the requested five-status workflow.
- Keeps all existing task rows and maps their old values to the closest new meaning.

2. Modified tables
- `public.tasks.status`: existing text column remains unchanged; its allowed values and default are updated.
- Existing `pending` values become `not_started`.
- Existing `completed` values become `approved`.
- Existing `in_progress` values remain `in_progress`.

3. Final status values
- `not_started`: work has not been started yet.
- `started`: work has been started.
- `in_progress`: work is currently being worked on.
- `approved`: task is approved/completed.
- `not_approved`: task is not approved.

4. Security
- No tables, columns, permissions, or row-level security policies are added or removed.
- Existing task access rules remain unchanged.

5. Data safety
- No task rows are deleted.
- No columns are dropped or renamed.
*/

ALTER TABLE public.tasks
  ALTER COLUMN status SET DEFAULT 'not_started';

UPDATE public.tasks
SET status = 'not_started'
WHERE status = 'pending';

UPDATE public.tasks
SET status = 'approved'
WHERE status = 'completed';

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('not_started', 'started', 'in_progress', 'approved', 'not_approved'));
