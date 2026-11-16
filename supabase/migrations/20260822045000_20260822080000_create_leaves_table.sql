/*
# Leave Management — Schema & RLS

1. Overview
   Adds a `leaves` table for tracking employee leave requests. Access is
   restricted to three specific email accounts (two masters + one view-only).

2. New Tables
   - `leaves`: a single leave request row.
     - employee_name (text, not null): name of the person taking leave.
     - from_date (date, not null): start of leave.
     - to_date (date, not null): end of leave.
     - day_type (text, not null): 'full' or 'half'.
     - reason (text): optional reason for the leave.
     - status (text, not null default 'pending'): 'pending', 'approved', 'rejected'.
     - created_by (uuid): the auth user who created the request.

3. Helper Functions
   - `can_manage_leaves()`: true when the signed-in user is a master whose
     email is in the allowed leave-management list.
   - `can_view_leaves()`: true when the signed-in user can view the leave
     section (masters + the view-only account).

4. Row Level Security
   - SELECT: only the three allowed emails can see leave rows.
   - INSERT: only the three allowed emails can create leave rows.
   - UPDATE: only the two master emails can approve/reject (update status).
   - DELETE: only the two master emails can delete a leave row.

5. Important Notes
   - Access control is enforced entirely at the database level via RLS.
   - The frontend never sees leave data unless the signed-in email is
     in the allowlist.
   - No existing tables, policies, or data are modified.
*/

CREATE TABLE IF NOT EXISTS public.leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name text NOT NULL,
  from_date date NOT NULL,
  to_date date NOT NULL,
  day_type text NOT NULL DEFAULT 'full' CHECK (day_type IN ('full', 'half')),
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leaves_status_idx ON public.leaves(status);
CREATE INDEX IF NOT EXISTS leaves_from_date_idx ON public.leaves(from_date);
CREATE INDEX IF NOT EXISTS leaves_created_at_idx ON public.leaves(created_at);

-- Auto-touch updated_at
DROP TRIGGER IF EXISTS leaves_touch_updated_at ON public.leaves;
CREATE TRIGGER leaves_touch_updated_at BEFORE UPDATE ON public.leaves
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- Helper functions
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_manage_leaves()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'master'
      AND p.email IN (
        'viraj.digitalsky360@gmail.com',
        'kprajapati9054@gmail.com'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_leaves()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.email IN (
        'viraj.digitalsky360@gmail.com',
        'kprajapati9054@gmail.com',
        'softrockwork@gmail.com'
      )
  );
$$;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leaves_select" ON public.leaves;
CREATE POLICY "leaves_select" ON public.leaves FOR SELECT
  TO authenticated USING (public.can_view_leaves());

DROP POLICY IF EXISTS "leaves_insert" ON public.leaves;
CREATE POLICY "leaves_insert" ON public.leaves FOR INSERT
  TO authenticated WITH CHECK (public.can_view_leaves());

DROP POLICY IF EXISTS "leaves_update" ON public.leaves;
CREATE POLICY "leaves_update" ON public.leaves FOR UPDATE
  TO authenticated
  USING (public.can_manage_leaves())
  WITH CHECK (public.can_manage_leaves());

DROP POLICY IF EXISTS "leaves_delete" ON public.leaves;
CREATE POLICY "leaves_delete" ON public.leaves FOR DELETE
  TO authenticated USING (public.can_manage_leaves());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.leaves;
