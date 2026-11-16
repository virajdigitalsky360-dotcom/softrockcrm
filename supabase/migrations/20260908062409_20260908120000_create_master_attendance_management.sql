/*
# Create Master-managed attendance records

1. Overview
   Adds the attendance records needed for daily and monthly employee attendance management.
   Attendance is intentionally managed by the two designated Master accounts only.

2. New Tables
   - `attendance_records`
   - `id`: unique attendance record identifier.
   - `team_member_id`: employee represented by the record.
   - `attendance_date`: local calendar date for the attendance record.
   - `status`: present, late, half_day, absent, or leave.
   - `check_in`: optional check-in timestamp.
   - `check_out`: optional check-out timestamp.
   - `notes`: optional administrative note.
   - `created_by` and `updated_by`: authenticated account that created or last changed the record.
   - `created_at` and `updated_at`: audit timestamps.

3. Security
   - Enables RLS on `attendance_records`.
   - Only Viraj (`viraj.digitalsky360@gmail.com`) and Kapil (`kapilrajprajapati9054@gmail.com`) with the Master role can select, insert, update, or delete attendance records.
   - Other authenticated users have no attendance access through the data API.
   - Authorization is checked in the database using the signed-in account, not a UI flag.

4. Master identity correction
   - Ensures Viraj and Kapil profiles have the Master role.
   - Updates the signup trigger so both current Master email addresses are recognized for future accounts.
   - No task, leave, notification, email, or existing permission data is changed.

5. Attendance rules
   - Status values are constrained to Present, Late, Half Day, Absent, and Leave.
   - A database trigger marks a normal employee's record Late when check-in is after 10:15 AM in Asia/Kolkata, unless the record is for a Master-linked employee.
   - Master users managing records are not restricted by this late rule.
*/

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE RESTRICT,
  attendance_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('present', 'late', 'half_day', 'absent', 'leave')),
  check_in timestamptz,
  check_out timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_member_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS attendance_records_date_idx
  ON public.attendance_records(attendance_date);
CREATE INDEX IF NOT EXISTS attendance_records_member_idx
  ON public.attendance_records(team_member_id);

CREATE OR REPLACE FUNCTION public.is_attendance_master()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'master'
      AND lower(email) IN ('viraj.digitalsky360@gmail.com', 'kapilrajprajapati9054@gmail.com')
  );
$$;

CREATE OR REPLACE FUNCTION public.apply_attendance_late_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  employee_email text;
  check_in_ist time;
BEGIN
  SELECT lower(tm.email) INTO employee_email
  FROM public.team_members tm
  WHERE tm.id = NEW.team_member_id;

  check_in_ist := (NEW.check_in AT TIME ZONE 'Asia/Kolkata')::time;

  IF employee_email NOT IN ('viraj.digitalsky360@gmail.com', 'kapilrajprajapati9054@gmail.com')
     AND NEW.check_in IS NOT NULL
     AND check_in_ist > time '10:15'
     AND NEW.status = 'present' THEN
    NEW.status := 'late';
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_records_touch_trigger ON public.attendance_records;
CREATE TRIGGER attendance_records_touch_trigger
  BEFORE INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.apply_attendance_late_rule();

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance_select_masters" ON public.attendance_records;
CREATE POLICY "attendance_select_masters" ON public.attendance_records
  FOR SELECT TO authenticated
  USING (public.is_attendance_master());

DROP POLICY IF EXISTS "attendance_insert_masters" ON public.attendance_records;
CREATE POLICY "attendance_insert_masters" ON public.attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (public.is_attendance_master());

DROP POLICY IF EXISTS "attendance_update_masters" ON public.attendance_records;
CREATE POLICY "attendance_update_masters" ON public.attendance_records
  FOR UPDATE TO authenticated
  USING (public.is_attendance_master())
  WITH CHECK (public.is_attendance_master());

DROP POLICY IF EXISTS "attendance_delete_masters" ON public.attendance_records;
CREATE POLICY "attendance_delete_masters" ON public.attendance_records
  FOR DELETE TO authenticated
  USING (public.is_attendance_master());

UPDATE public.profiles
SET role = 'master'
WHERE lower(email) IN ('viraj.digitalsky360@gmail.com', 'kapilrajprajapati9054@gmail.com');

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_tm uuid;
BEGIN
  v_role := CASE
    WHEN lower(new.email) IN ('viraj.digitalsky360@gmail.com', 'kapilrajprajapati9054@gmail.com') THEN 'master'
    WHEN lower(new.email) = 'softrockwork@gmail.com' THEN 'view_all'
    ELSE 'normal'
  END;
  SELECT id INTO v_tm FROM public.team_members WHERE lower(email) = lower(new.email);
  INSERT INTO public.profiles (id, email, role, team_member_id)
  VALUES (new.id, new.email, v_role, v_tm)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.is_attendance_master() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_attendance_master() TO authenticated;
REVOKE ALL ON FUNCTION public.apply_attendance_late_rule() FROM anon, authenticated;
