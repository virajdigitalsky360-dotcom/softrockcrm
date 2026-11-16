-- Disable the immediate "New Task Created" email notification.
-- This drops the AFTER INSERT trigger on public.tasks so that creating
-- a new task no longer fires the task-created-notification edge function.
--
-- The 6:00 PM IST pending-task email system (cron-based) is NOT affected.
-- The notify_task_created() function, the task-created-notification edge
-- function, and the task_created_email_logs table are all preserved so
-- existing email history remains intact.
--
-- To re-enable in the future, recreate the trigger:
--   CREATE TRIGGER trigger_task_created_notify
--     AFTER INSERT ON public.tasks
--     FOR EACH ROW
--     EXECUTE FUNCTION public.notify_task_created();

DROP TRIGGER IF EXISTS trigger_task_created_notify ON public.tasks;
