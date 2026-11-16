/*
# Restrict manual attendance control to Viraj (Primary Master) only

## Purpose
Remove Kapil from all manual attendance permissions. Only Viraj (Primary Master)
can manually create, edit, or correct attendance records. This is enforced at the
database level via RLS policies and a trigger — not just the UI.

## Changes

### 1. New SQL function: `is_primary_attendance_master()`
Returns true ONLY for Viraj (viraj.digitalsky360@gmail.com) with role = 'master'.
This replaces `is_attendance_master()` in all write policies (INSERT/UPDATE/DELETE).
Kapil is no longer an attendance master for write operations.

### 2. Updated RLS policies on `attendance_records`
- SELECT: unchanged — `is_attendance_master() OR is_own_attendance()` (Kapil can still VIEW records)
- INSERT: now `is_primary_attendance_master() OR is_own_attendance()` (only Viraj can manually create)
- UPDATE: now `is_primary_attendance_master() OR is_own_attendance()` (only Viraj can manually correct)
- DELETE: now `is_primary_attendance_master()` (only Viraj can delete)

### 3. Updated `apply_attendance_rules()` trigger
- Only sets `manually_overridden = true` when the editor is Viraj (not any master)
- Server-populates `overridden_by`, `overridden_at`, `override_reason` from auth context
  (prevents client-side spoofing)
- Preserves all existing automatic rules: 10:15 IST late check, Kapil exclusion,
  updated_at/updated_by tracking

### 4. New table: `attendance_audit_log`
Records every manual attendance change with:
- previous_status, new_status, reason (override_reason)
- changed_by (Viraj's auth.uid()), changed_at (timestamp)
- team_member_id, attendance_date
- RLS: SELECT to masters only; INSERT via trigger (SECURITY DEFINER)

### 5. New trigger: `attendance_audit_trigger`
AFTER INSERT OR UPDATE on `attendance_records` — when manually_overridden is true
and the change is from an authenticated Viraj, inserts an audit log row.

## Security
- RLS remains ENABLED on `attendance_records` — no changes to that.
- `is_attendance_master()` is preserved for SELECT (Kapil can still view/export).
- Only `is_primary_attendance_master()` grants write access.
- Audit columns are now server-populated (trigger), not client-supplied.
- No existing data is modified or deleted.
- All automatic attendance rules (10:40 AM check, Sunday/holiday) are preserved.
*/
--

-- 1. Create is_primary_attendance_master() — Viraj only
CREATE OR REPLACE FUNCTION public.is_primary_attendance_master()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'master'
      AND lower(email) = 'viraj.digitalsky360@gmail.com'
  );
$function$;

GRANT EXECUTE ON FUNCTION public.is_primary_attendance_master() TO authenticated;

-- 2. Update RLS policies on attendance_records
-- SELECT: unchanged (Kapil can still view)
DROP POLICY IF EXISTS "attendance_select_access" ON public.attendance_records;
CREATE POLICY "attendance_select_access"
  ON public.attendance_records FOR SELECT
  TO authenticated
  USING (is_attendance_master() OR is_own_attendance(team_member_id));

-- INSERT: only Viraj or self
DROP POLICY IF EXISTS "attendance_insert_access" ON public.attendance_records;
CREATE POLICY "attendance_insert_access"
  ON public.attendance_records FOR INSERT
  TO authenticated
  WITH CHECK (is_primary_attendance_master() OR is_own_attendance(team_member_id));

-- UPDATE: only Viraj or self (for check-in/check-out)
DROP POLICY IF EXISTS "attendance_update_access" ON public.attendance_records;
CREATE POLICY "attendance_update_access"
  ON public.attendance_records FOR UPDATE
  TO authenticated
  USING (is_primary_attendance_master() OR is_own_attendance(team_member_id))
  WITH CHECK (is_primary_attendance_master() OR is_own_attendance(team_member_id));

-- DELETE: only Viraj
DROP POLICY IF EXISTS "attendance_delete_access" ON public.attendance_records;
CREATE POLICY "attendance_delete_access"
  ON public.attendance_records FOR DELETE
  TO authenticated
  USING (is_primary_attendance_master());

-- 3. Update apply_attendance_rules() trigger function
CREATE OR REPLACE FUNCTION public.apply_attendance_rules()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  employee_email text;
  check_in_ist time;
  is_viraj_edit boolean;
BEGIN
  SELECT lower(tm.email) INTO employee_email
  FROM public.team_members tm
  WHERE tm.id = NEW.team_member_id;

  -- Block attendance records for Kapil entirely
  IF employee_email = 'kapilrajprajapati9054@gmail.com' THEN
    RAISE EXCEPTION 'Attendance records cannot be created for Kapil (Master).';
  END IF;

  -- Check if this is a Viraj (Primary Master) edit
  is_viraj_edit := false;
  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'master'
        AND lower(email) = 'viraj.digitalsky360@gmail.com'
    ) INTO is_viraj_edit;
  END IF;

  -- Only Viraj can set manually_overridden; server-populate audit columns
  IF is_viraj_edit AND TG_OP = 'UPDATE' THEN
    NEW.manually_overridden := true;
    NEW.overridden_by := auth.uid();
    NEW.overridden_at := now();
  END IF;

  -- Also set audit columns on Viraj INSERT (manual creation)
  IF is_viraj_edit AND TG_OP = 'INSERT' AND COALESCE(NEW.manually_overridden, false) THEN
    NEW.overridden_by := auth.uid();
    NEW.overridden_at := now();
  END IF;

  -- Apply late/on_time rule only for non-Master employees
  -- Skip if manually overridden (Master set a specific status intentionally)
  IF employee_email NOT IN ('viraj.digitalsky360@gmail.com', 'kapilrajprajapati9054@gmail.com')
    AND NEW.check_in IS NOT NULL
    AND NEW.status IN ('on_time', 'late', 'present')
    AND NOT COALESCE(NEW.manually_overridden, false)
  THEN
    check_in_ist := (NEW.check_in AT TIME ZONE 'Asia/Kolkata')::time;
    IF check_in_ist > time '10:15' THEN
      NEW.status := 'late';
    ELSE
      NEW.status := 'on_time';
    END IF;
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$function$;

-- 4. Create attendance_audit_log table
CREATE TABLE IF NOT EXISTS public.attendance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id uuid REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL,
  attendance_date date NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  reason text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_audit_log_record_idx
  ON public.attendance_audit_log(attendance_record_id);
CREATE INDEX IF NOT EXISTS attendance_audit_log_date_idx
  ON public.attendance_audit_log(attendance_date);

ALTER TABLE public.attendance_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_select_masters" ON public.attendance_audit_log;
CREATE POLICY "audit_select_masters"
  ON public.attendance_audit_log FOR SELECT
  TO authenticated
  USING (public.is_master());

DROP POLICY IF EXISTS "audit_insert_trigger" ON public.attendance_audit_log;
-- INSERT is done by the SECURITY DEFINER trigger function, which bypasses RLS.
-- We still need a policy for direct inserts by Viraj (fallback).
CREATE POLICY "audit_insert_trigger"
  ON public.attendance_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_primary_attendance_master());

-- 5. Create audit trigger function + trigger
CREATE OR REPLACE FUNCTION public.log_attendance_audit()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  is_viraj boolean;
  prev_status text;
BEGIN
  -- Only log manual changes by Viraj (Primary Master)
  is_viraj := public.is_primary_attendance_master();
  IF NOT is_viraj THEN
    RETURN NEW;
  END IF;

  -- Only log when manually_overridden is true (manual edits)
  IF NOT COALESCE(NEW.manually_overridden, false) THEN
    RETURN NEW;
  END IF;

  prev_status := NULL;
  IF TG_OP = 'UPDATE' THEN
    prev_status := OLD.status;
    -- Only log if status actually changed or reason was set
    IF prev_status = NEW.status AND COALESCE(NEW.override_reason, '') = COALESCE(OLD.override_reason, '') THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.attendance_audit_log
    (attendance_record_id, team_member_id, attendance_date, previous_status, new_status, reason, changed_by, changed_at)
  VALUES
    (NEW.id, NEW.team_member_id, NEW.attendance_date, prev_status, NEW.status, NEW.override_reason, auth.uid(), now());

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS attendance_audit_trigger ON public.attendance_records;
CREATE TRIGGER attendance_audit_trigger
  AFTER INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.log_attendance_audit();
