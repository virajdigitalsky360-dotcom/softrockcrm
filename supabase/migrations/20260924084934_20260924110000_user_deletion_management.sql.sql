/*
# User & Data Management — Audit Log + Deletion RPC

## Purpose
Provides secure, backend-enforced user deletion for the Primary Master (Viraj).
Only Viraj can delete users or user data. All deletions are recorded in an audit log.

## New Tables

### user_deletion_audit
- id (uuid, PK)
- deleted_user_id (uuid) — the Supabase Auth user ID of the deleted user
- deleted_user_name (text) — display name at time of deletion
- deleted_user_email (text) — email at time of deletion
- deleted_by (uuid) — the Auth user ID of who performed the deletion
- deleted_by_email (text) — email of who performed the deletion
- deletion_type (text) — 'full' or 'data_only'
- success (boolean) — whether the deletion completed
- error_message (text, nullable) — error details if failed
- created_at (timestamptz) — when the audit record was created

## Security
- RLS enabled on user_deletion_audit.
- Only Viraj (Primary Master) can read the audit log.
- Only Viraj can insert audit records (the RPC enforces this).
- The RPC `delete_user_account` is SECURITY DEFINER and only callable by Viraj.
- The RPC handles full deletion (auth account + all CRM data) or data-only deletion.
- The Primary Master account can never be deleted.
- A user cannot delete themselves.
*/

-- 1. Create the audit log table
CREATE TABLE IF NOT EXISTS public.user_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_user_id uuid NOT NULL,
  deleted_user_name text,
  deleted_user_email text,
  deleted_by uuid NOT NULL,
  deleted_by_email text,
  deletion_type text NOT NULL CHECK (deletion_type IN ('full', 'data_only')),
  success boolean NOT NULL DEFAULT false,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_deletion_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_select_viraj" ON public.user_deletion_audit;
CREATE POLICY "audit_select_viraj"
  ON public.user_deletion_audit FOR SELECT
  TO authenticated
  USING (
    (SELECT email FROM public.profiles WHERE id = auth.uid()) = 'viraj.digitalsky360@gmail.com'
  );

DROP POLICY IF EXISTS "audit_insert_viraj" ON public.user_deletion_audit;
CREATE POLICY "audit_insert_viraj"
  ON public.user_deletion_audit FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT email FROM public.profiles WHERE id = auth.uid()) = 'viraj.digitalsky360@gmail.com'
  );

-- 2. Create the deletion RPC
-- This function is SECURITY DEFINER so it can delete from auth.users via the service role.
-- It enforces: only Viraj can call it, can't delete Viraj, can't delete self.
CREATE OR REPLACE FUNCTION public.delete_user_account(p_target_user_id uuid, p_deletion_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid;
  caller_email text;
  target_email text;
  target_name text;
  target_team_member_id uuid;
  audit_id uuid;
  error_msg text;
BEGIN
  -- Get caller info
  caller_id := auth.uid();
  SELECT email INTO caller_email FROM public.profiles WHERE id = caller_id;

  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;

  -- Only Viraj can delete users
  IF caller_email <> 'viraj.digitalsky360@gmail.com' THEN
    RAISE EXCEPTION 'Only the Primary Master can delete users.';
  END IF;

  -- Can't delete yourself
  IF p_target_user_id = caller_id THEN
    RAISE EXCEPTION 'You cannot delete your own account.';
  END IF;

  -- Can't delete Viraj
  SELECT email, display_name, team_member_id INTO target_email, target_name, target_team_member_id
  FROM public.profiles WHERE id = p_target_user_id;

  IF target_email IS NULL THEN
    RAISE EXCEPTION 'Target user not found.';
  END IF;

  IF target_email = 'viraj.digitalsky360@gmail.com' THEN
    RAISE EXCEPTION 'The Primary Master account cannot be deleted.';
  END IF;

  IF p_deletion_type NOT IN ('full', 'data_only') THEN
    RAISE EXCEPTION 'Invalid deletion type. Use "full" or "data_only".';
  END IF;

  -- Create audit record (initially marked as failed; updated on success)
  INSERT INTO public.user_deletion_audit (
    deleted_user_id, deleted_user_name, deleted_user_email,
    deleted_by, deleted_by_email, deletion_type, success, created_at
  ) VALUES (
    p_target_user_id, target_name, target_email,
    caller_id, caller_email, p_deletion_type, false, now()
  ) RETURNING id INTO audit_id;

  BEGIN
    -- Delete user's CRM data (for both 'full' and 'data_only')

    -- Tasks created by this user
    DELETE FROM public.tasks WHERE created_by = p_target_user_id;

    -- Task notes created by this user
    DELETE FROM public.task_notes WHERE created_by = p_target_user_id;

    -- Sticky notes owned by this user
    DELETE FROM public.sticky_notes WHERE user_id = p_target_user_id;

    -- Leave records owned by or created by this user
    DELETE FROM public.leaves WHERE user_id = p_target_user_id OR created_by = p_target_user_id;

    -- Attendance records created/updated/overridden by this user
    DELETE FROM public.attendance_records WHERE created_by = p_target_user_id
      OR updated_by = p_target_user_id OR overridden_by = p_target_user_id;

    -- Email notification settings updated by this user
    DELETE FROM public.email_notification_settings WHERE updated_by = p_target_user_id;

    -- User access settings
    DELETE FROM public.user_access_settings WHERE user_id = p_target_user_id;

    -- Office holidays created by this user
    DELETE FROM public.office_holidays WHERE created_by = p_target_user_id;

    -- If the user has a team_member linked, clean up their email notification settings
    IF target_team_member_id IS NOT NULL THEN
      DELETE FROM public.email_notification_settings WHERE team_member_id = target_team_member_id;
    END IF;

    -- For 'full' deletion: also remove the auth account and profile
    IF p_deletion_type = 'full' THEN
      -- Delete from auth.users (cascades to profiles if FK exists, otherwise delete profile too)
      DELETE FROM auth.users WHERE id = p_target_user_id;
      -- Also delete the profile row in case there's no FK cascade
      DELETE FROM public.profiles WHERE id = p_target_user_id;
    END IF;

    -- Mark audit as successful
    UPDATE public.user_deletion_audit
    SET success = true, error_message = NULL
    WHERE id = audit_id;

    RETURN jsonb_build_object(
      'success', true,
      'audit_id', audit_id,
      'deleted_user_email', target_email,
      'deletion_type', p_deletion_type
    );

  EXCEPTION WHEN OTHERS THEN
    error_msg := SQLERRM;
    UPDATE public.user_deletion_audit
    SET success = false, error_message = error_msg
    WHERE id = audit_id;

    RETURN jsonb_build_object(
      'success', false,
      'audit_id', audit_id,
      'error', error_msg
    );
  END;
END;
$$;

-- Grant execute only to authenticated (the function itself checks for Viraj)
GRANT EXECUTE ON FUNCTION public.delete_user_account(uuid, text) TO authenticated;
