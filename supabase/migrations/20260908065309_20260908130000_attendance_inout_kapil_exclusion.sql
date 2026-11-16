/*
# Attendance IN/OUT rules and Kapil exclusion

1. Add 'on_time' status to attendance_records
   - IN at or before 10:15 AM IST = on_time
   - IN after 10:15 AM IST = late
   - Statuses: on_time, late, half_day, absent, leave

2. Kapil exclusion
   - Kapil (kapilrajprajapati9054@gmail.com) must never have attendance records.
   - A database trigger blocks INSERT of any attendance row for Kapil's team_member.
   - Existing Kapil attendance rows (if any) are deleted.

3. Late rule update
   - The trigger now sets status to 'on_time' when check_in <= 10:15 AM IST.
   - Sets status to 'late' when check_in > 10:15 AM IST.
   - Only applies to non-Master employees (Viraj and Kapil emails are exempt).
   - Does not override half_day, absent, or leave statuses.
*/

ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_status_check;

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_status_check
  CHECK (status IN ('on_time', 'late', 'half_day', 'absent', 'leave'));

CREATE OR REPLACE FUNCTION public.apply_attendance_rules()
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

  -- Block attendance records for Kapil entirely
  IF employee_email = 'kapilrajprajapati9054@gmail.com' THEN
    RAISE EXCEPTION 'Attendance records cannot be created for Kapil (Master).';
  END IF;

  -- Apply late/on_time rule only for non-Master employees
  IF employee_email NOT IN ('viraj.digitalsky360@gmail.com', 'kapilrajprajapati9054@gmail.com')
     AND NEW.check_in IS NOT NULL
     AND NEW.status IN ('on_time', 'late', 'present') THEN
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
$$;

DROP TRIGGER IF EXISTS attendance_records_touch_trigger ON public.attendance_records;
CREATE TRIGGER attendance_records_touch_trigger
  BEFORE INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.apply_attendance_rules();

-- Delete any existing Kapil attendance rows
DELETE FROM public.attendance_records
WHERE team_member_id IN (
  SELECT id FROM public.team_members WHERE lower(email) = 'kapilrajprajapati9054@gmail.com'
);

-- Migrate any 'present' status to 'on_time'
UPDATE public.attendance_records SET status = 'on_time' WHERE status = 'present';
