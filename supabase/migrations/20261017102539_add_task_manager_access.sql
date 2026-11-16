/*
# Add Task Manager access grant to user_access_settings

## Purpose
Allows a Master to grant a non-master user (e.g. Rostan, role = 'normal') access to the
Task Manager feature without promoting their role. The grant is stored in the database
and enforced at the backend via a SECURITY DEFINER SQL function, so the frontend never
trusts a hardcoded email list.

## Changes
1. Adds `task_manager_access boolean NOT NULL DEFAULT false` to `user_access_settings`.
2. Creates `can_access_task_manager()` SECURITY DEFINER function that returns true if:
   - the caller is a master (is_master()), OR
   - the caller has a row in user_access_settings with task_manager_access = true.
3. Inserts a row granting Rostan (softrockind@gmail.com) task_manager_access = true.
4. RLS: existing master-only INSERT/UPDATE/DELETE policies already cover the new column
   (policies are column-agnostic). The existing SELECT policy (auth.uid() = user_id)
   lets each user read their own access flags. No new policies needed.
*/

ALTER TABLE public.user_access_settings
  ADD COLUMN IF NOT EXISTS task_manager_access boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.can_access_task_manager()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT
    public.is_master()
    OR COALESCE((
      SELECT task_manager_access
      FROM public.user_access_settings
      WHERE user_id = auth.uid()
    ), false);
$function$;

GRANT EXECUTE ON FUNCTION public.can_access_task_manager() TO authenticated;

-- Grant Rostan task manager access
INSERT INTO public.user_access_settings (user_id, task_manager_access)
SELECT p.id, true
FROM public.profiles p
WHERE p.email = 'softrockind@gmail.com'
ON CONFLICT (user_id)
DO UPDATE SET task_manager_access = true;
