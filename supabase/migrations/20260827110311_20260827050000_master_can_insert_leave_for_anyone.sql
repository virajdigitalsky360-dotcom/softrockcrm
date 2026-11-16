/*
# Allow Master users to create leave records for any employee

## Summary
Currently the `leaves` table INSERT policy only allows a user to create
leave with their own `user_id` (`user_id = auth.uid()`). This blocks Master
users from creating leave requests on behalf of other team members.

The SELECT, UPDATE, and DELETE policies already allow Master users to
access all leave records. Only INSERT was missing the Master exception.

## Changes
- Drops and recreates the `leaves_insert` policy to allow:
  1. Any authenticated user to insert a leave with their own user_id (unchanged).
  2. Master users to insert a leave with ANY user_id (including NULL for
     team members who don't have a user account).

## Security
- No changes to SELECT, UPDATE, or DELETE policies.
- No changes to RLS enable state.
- No changes to table grants or column privileges.
- Normal users remain restricted to their own leaves for all operations.
- Master role is verified via `profiles.role = 'master'` — same pattern
  used by all existing leave policies.
- No existing leave records are modified or deleted.
*/

DROP POLICY IF EXISTS "leaves_insert" ON public.leaves;

CREATE POLICY "leaves_insert" ON public.leaves
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'master'
    )
  );
