/*
# Leave Management for All Users

## Summary
Expands leave access from a restricted email allowlist to ALL authenticated users.
Each user manages their own leave requests; master users can see, approve, reject,
edit, and delete any user's leave records.

## Changes

### 1. Add `user_id` column to `leaves`
- `user_id uuid` — links the leave to the authenticated user who created it.
- Defaults to `auth.uid()` so inserts from the frontend succeed even when the
  client omits the field (same pattern as other owner-scoped tables).
- Backfilled existing rows: set `user_id = created_by` where `created_by` is not null.

### 2. Update RLS policies on `leaves`
- **SELECT**: authenticated users can read their own rows OR any row if they are master.
- **INSERT**: authenticated users can insert their own rows (user_id = auth.uid()).
- **UPDATE**: master users can update any row. Non-master users can update their own
  rows but NOT the status field (status changes are master-only). A trigger enforces
  this at the database level so a non-master cannot escalate by directly setting status.
- **DELETE**: master users can delete any row; users can delete their own rows.

### 3. Trigger: `guard_leave_status_update`
- Prevents non-master users from changing the `status` column on UPDATE.
- Master users (role = 'master') are exempt.
- Fires BEFORE UPDATE on `leaves`.

### 4. Updated helper functions
- `can_view_leaves()` — now returns true for ALL authenticated users.
- `can_manage_leaves()` — returns true only for master users.
- Kept for backward compatibility with existing policy names.

## Security
- RLS remains enabled on `leaves`.
- Normal users can only see/edit/delete their own leave requests.
- Only master users can approve/reject (change status) or delete others' leaves.
- The status-change guard is enforced at the database level via trigger, so even
  if a user tries to set status directly via the API, the trigger blocks it.
*/
-- 1. Add user_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leaves' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.leaves ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
    ALTER TABLE public.leaves ALTER COLUMN user_id SET DEFAULT auth.uid();
  END IF;
END $$;

-- Backfill: set user_id from created_by for existing rows
UPDATE public.leaves
SET user_id = created_by
WHERE user_id IS NULL AND created_by IS NOT NULL;

-- 2. Drop old policies and recreate with new access rules
DROP POLICY IF EXISTS "leaves_select" ON public.leaves;
DROP POLICY IF EXISTS "leaves_insert" ON public.leaves;
DROP POLICY IF EXISTS "leaves_update" ON public.leaves;
DROP POLICY IF EXISTS "leaves_delete" ON public.leaves;

-- SELECT: own rows OR master sees all
CREATE POLICY "leaves_select" ON public.leaves FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'master')
  );

-- INSERT: only own rows
CREATE POLICY "leaves_insert" ON public.leaves FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

-- UPDATE: master can update any; users can update their own (but trigger guards status)
CREATE POLICY "leaves_update" ON public.leaves FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'master')
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'master')
  );

-- DELETE: master can delete any; users can delete their own
CREATE POLICY "leaves_delete" ON public.leaves FOR DELETE
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'master')
  );

-- 3. Trigger to prevent non-master users from changing status
DROP TRIGGER IF EXISTS guard_leave_status_update ON public.leaves;
DROP FUNCTION IF EXISTS public.guard_leave_status_update();

CREATE OR REPLACE FUNCTION public.guard_leave_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- If status is being changed, only master users are allowed
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'master'
    ) THEN
      RAISE EXCEPTION 'Only master users can change leave status';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER guard_leave_status_update
  BEFORE UPDATE ON public.leaves
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_leave_status_update();

-- 4. Update helper functions for backward compatibility
CREATE OR REPLACE FUNCTION public.can_view_leaves()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = auth.uid()
);
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_leaves()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = auth.uid()
  AND p.role = 'master'
);
$function$;

-- Add index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_leaves_user_id ON public.leaves(user_id);
CREATE INDEX IF NOT EXISTS idx_leaves_status ON public.leaves(status);
