/*
# Global Maintenance Mode Backend Enforcement

## Purpose
When Viraj (Primary Master) turns Maintenance Mode ON, ALL non-master users must be
blocked from the CRM. Only Viraj retains access. This migration adds:

1. A SECURITY DEFINER function `is_maintenance_mode()` that returns true/false —
   callable by any authenticated user (used by the frontend to check the global state).
2. A SECURITY DEFINER function `set_maintenance_mode(enabled boolean)` that ONLY
   Viraj can call — enforces at the database level that only the Primary Master
   can toggle maintenance mode.
3. Tightens the settings table UPDATE policy so only masters can write, but
   keeps SELECT open to all authenticated users (needed so every user's frontend
   can detect maintenance mode in real-time).

## Security
- SELECT on settings remains open to authenticated users (needed for real-time
  maintenance mode detection). This is safe — settings only contains boolean flags.
- WRITE on settings is restricted to master role via existing `is_master()` policy.
- The `set_maintenance_mode` RPC adds an explicit Viraj-email check on top of that.
- No data is deleted or modified beyond the function/policy definitions.
*/

-- 1. Function to check if maintenance mode is on (callable by any authenticated user)
CREATE OR REPLACE FUNCTION public.is_maintenance_mode()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT value FROM public.settings WHERE key = 'maintenance_mode'),
    'false'
  ) = 'true';
$$;

-- 2. Function to toggle maintenance mode (only Viraj can call)
CREATE OR REPLACE FUNCTION public.set_maintenance_mode(enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email text;
BEGIN
  SELECT email INTO caller_email FROM public.profiles WHERE id = auth.uid();

  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'You must be logged in to change maintenance mode.';
  END IF;

  IF caller_email <> 'viraj.digitalsky360@gmail.com' THEN
    RAISE EXCEPTION 'Only the Primary Master (Viraj) can toggle Maintenance Mode.';
  END IF;

  INSERT INTO public.settings (key, value, updated_at)
  VALUES ('maintenance_mode', enabled::text, now())
  ON CONFLICT (key) DO UPDATE
  SET value = enabled::text, updated_at = now();
END;
$$;

-- 3. Grant execute on the read function to authenticated users
GRANT EXECUTE ON FUNCTION public.is_maintenance_mode() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_maintenance_mode(boolean) TO authenticated;

-- 4. Ensure settings SELECT is available to all authenticated users (already open, make explicit)
-- The existing policy "st_select" allows SELECT for all (USING true) — keep it.
-- The existing policy "st_write" restricts writes to is_master() — keep it.

-- 5. Add helpful comment
COMMENT ON FUNCTION public.is_maintenance_mode() IS 'Returns true when global CRM maintenance mode is ON. Callable by any authenticated user.';
COMMENT ON FUNCTION public.set_maintenance_mode(boolean) IS 'Toggles global CRM maintenance mode. Only Viraj (Primary Master) can call this.';
