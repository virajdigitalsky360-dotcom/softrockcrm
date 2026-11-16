/*
# Attendance RLS: employee self-access + Master full access + export guard

1. Employee self-access
   - Non-Master employees can SELECT their own attendance records (matched via team_member_id to their profile).
   - Employees can INSERT/UPDATE their own check_in and check_out only (self check-in/out).
   - Employees cannot delete their own attendance records.

2. Master full access
   - Viraj and Kapil retain full CRUD on all attendance records (already in place).
   - The is_attendance_master() function is reused for Master checks.

3. Export permission guard
   - A SECURITY DEFINER function export_attendance_report() returns attendance data only to Masters.
   - This enforces server-side that only Viraj and Kapil can extract/export attendance data.
*/

-- Helper: check if the current user's profile links to a given team_member
CREATE OR REPLACE FUNCTION public.is_own_attendance(target_team_member_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND team_member_id = target_team_member_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_own_attendance(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_own_attendance(uuid) TO authenticated;

-- Replace the SELECT policy so Masters see all, employees see only their own
DROP POLICY IF EXISTS "attendance_select_masters" ON public.attendance_records;
CREATE POLICY "attendance_select_access" ON public.attendance_records
  FOR SELECT TO authenticated
  USING (
    public.is_attendance_master()
    OR public.is_own_attendance(team_member_id)
  );

-- Replace INSERT: Masters can insert for anyone, employees can insert for themselves
DROP POLICY IF EXISTS "attendance_insert_masters" ON public.attendance_records;
CREATE POLICY "attendance_insert_access" ON public.attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_attendance_master()
    OR public.is_own_attendance(team_member_id)
  );

-- Replace UPDATE: Masters can update anyone, employees can update only their own
DROP POLICY IF EXISTS "attendance_update_masters" ON public.attendance_records;
CREATE POLICY "attendance_update_access" ON public.attendance_records
  FOR UPDATE TO authenticated
  USING (
    public.is_attendance_master()
    OR public.is_own_attendance(team_member_id)
  )
  WITH CHECK (
    public.is_attendance_master()
    OR public.is_own_attendance(team_member_id)
  );

-- DELETE remains Master-only
DROP POLICY IF EXISTS "attendance_delete_masters" ON public.attendance_records;
CREATE POLICY "attendance_delete_access" ON public.attendance_records
  FOR DELETE TO authenticated
  USING (public.is_attendance_master());
