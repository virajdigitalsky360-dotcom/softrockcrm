/*
# Fix user_access_settings SELECT policy for Master access

## Problem
The existing SELECT policy on `user_access_settings` only allows users to read their own row
(`auth.uid() = user_id`). When a Master (Viraj) tries to grant/revoke Task Manager access for
another user (e.g. Rostan), the upsert (INSERT ... ON CONFLICT DO UPDATE) fails because:
1. Postgres cannot see the conflicting row through RLS to resolve the conflict.
2. The error "new row violates row-level security policy" is raised.

## Fix
Replace the SELECT policy to allow Masters to read ALL rows (so they can manage other users'
access settings), while non-masters can still read only their own row.

## Security
- RLS remains ENABLED — no changes to that.
- INSERT/UPDATE/DELETE policies remain master-only — unchanged.
- SELECT is now: `auth.uid() = user_id OR is_master()` — masters can see all rows, users see only their own.
- Only authorized Master accounts can modify permissions. RLS is never disabled.
*/

DROP POLICY IF EXISTS "select_own_access" ON public.user_access_settings;

CREATE POLICY "select_own_access"
  ON public.user_access_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_master());
