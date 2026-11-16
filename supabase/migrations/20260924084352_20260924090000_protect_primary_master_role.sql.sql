/*
# Protect Primary Master (Viraj) Role — Permanent Backend Enforcement

## Purpose
Viraj (viraj.digitalsky360@gmail.com) is the Primary Master. His role must NEVER be
downgraded or removed by any UI action, role-change RPC, or direct table update.
This migration enforces that at the database level.

## Changes

### 1. Restore Viraj's role to 'master'
UPDATE profiles SET role = 'master' WHERE email = 'viraj.digitalsky360@gmail.com'.

### 2. Create a BEFORE UPDATE trigger on profiles
The trigger fires BEFORE any UPDATE on the profiles table. If the row being updated
belongs to Viraj and the NEW role is not 'master', the trigger raises an exception.

### 3. Update set_user_role() SECURITY DEFINER function
Add a guard: if the target user is Viraj and the requested role is not 'master',
raise an exception with a user-friendly message.

### 4. Create a BEFORE INSERT/UPDATE trigger on user_access_settings
Prevents anyone from setting crm_down = true on Viraj's row.

## Security
- All protections are at the database/backend level (triggers + RPC guards).
- No existing data, tasks, emails, holidays, attendance, or leave settings are modified.
- Only Viraj's role column is restored to 'master'.
- Other users' roles are not touched.
*/

-- 1. Restore Viraj's role to master
UPDATE public.profiles
SET role = 'master'
WHERE email = 'viraj.digitalsky360@gmail.com';

-- 2. Create the trigger function that protects Viraj's role
CREATE OR REPLACE FUNCTION public.protect_primary_master_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'viraj.digitalsky360@gmail.com' AND NEW.role <> 'master' THEN
    RAISE EXCEPTION 'Viraj (Primary Master) role cannot be changed or downgraded. This is a permanent system protection.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_primary_master_role_trigger ON public.profiles;
CREATE TRIGGER protect_primary_master_role_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_primary_master_role();

-- 3. Update set_user_role() to reject Viraj role changes
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_email text;
BEGIN
  IF NOT public.is_master() THEN
    RAISE EXCEPTION 'Only master users can change roles';
  END IF;

  IF p_role NOT IN ('master', 'view_all', 'task_manager', 'normal') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  SELECT email INTO target_email FROM public.profiles WHERE id = p_user_id;

  IF target_email = 'viraj.digitalsky360@gmail.com' AND p_role <> 'master' THEN
    RAISE EXCEPTION 'Viraj is the Primary Master. The role cannot be changed or downgraded.';
  END IF;

  UPDATE public.profiles SET role = p_role WHERE id = p_user_id;
END;
$$;

-- 4. Create trigger function to prevent CRM-down on Viraj
CREATE OR REPLACE FUNCTION public.protect_primary_master_crm_down()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
BEGIN
  SELECT email INTO user_email FROM public.profiles WHERE id = NEW.user_id;

  IF user_email = 'viraj.digitalsky360@gmail.com' AND NEW.crm_down = true THEN
    RAISE EXCEPTION 'Viraj (Primary Master) cannot be set to CRM Down. This is a permanent system protection.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_primary_master_crm_down_trigger ON public.user_access_settings;
CREATE TRIGGER protect_primary_master_crm_down_trigger
  BEFORE INSERT OR UPDATE ON public.user_access_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_primary_master_crm_down();

-- 5. Add a protective comment
COMMENT ON TABLE public.profiles IS 'User profiles. Viraj (viraj.digitalsky360@gmail.com) is permanently protected as Primary Master — role cannot be downgraded by any UI or database action.';
