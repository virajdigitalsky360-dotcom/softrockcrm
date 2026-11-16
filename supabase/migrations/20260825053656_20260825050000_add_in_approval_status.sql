-- Add "in_approval" to the task status CHECK constraint
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK (status in ('not_started','started','in_progress','in_approval','approved','not_approved'));
