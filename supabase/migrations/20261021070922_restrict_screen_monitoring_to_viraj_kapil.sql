/*
# Restrict Live Screen Monitoring to Viraj and Kapil only

## Purpose
Only Viraj (Primary Master) and Kapil (Master) can access the Live Screen Monitoring
feature. Every other user is blocked from viewing shared screens. Viraj and Kapil
are excluded from being screen-sharing subjects — their PCs can never be captured
or displayed.

## Changes

### 1. New SQL function: `is_screen_monitor()`
Returns true ONLY for Viraj and Kapil (by email + role = 'master').
Used in RLS policies and the edge function to gate viewer access.

### 2. Tightened RLS on `screen_share_sessions`
- SELECT: only screen monitors (Viraj/Kapil) or the session owner (streamer)
- INSERT: only authenticated users who are NOT screen monitors (Viraj/Kapil cannot
  create share sessions for themselves — they can never be streamers)
- UPDATE: owner or screen monitor (with WITH CHECK to prevent session hijacking)
- DELETE: owner or screen monitor

### 3. Tightened RLS on `signaling_messages`
- Removed the wide-open `FOR ALL USING(true) WITH CHECK(true)` policy
- SELECT: only authenticated users (the edge function uses service role, bypasses RLS)
- INSERT/UPDATE/DELETE: authenticated only
- This prevents unauthenticated (anon) access to signaling data

### 4. No schema changes
No columns added, removed, or modified. No tables dropped. All existing data preserved.
All existing CRM roles and permissions unchanged.

## Security
- RLS remains ENABLED on both tables.
- Viraj and Kapil can VIEW all active share sessions but can never CREATE their own.
- Non-master users cannot see any share sessions except their own.
- The `is_screen_monitor()` function is SECURITY DEFINER and checks both role and email.
*/
--

-- 1. Create is_screen_monitor() — Viraj + Kapil only
CREATE OR REPLACE FUNCTION public.is_screen_monitor()
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
      AND lower(email) IN (
        'viraj.digitalsky360@gmail.com',
        'kapilprajapati9054@gmail.com'
      )
  );
$function$;

GRANT EXECUTE ON FUNCTION public.is_screen_monitor() TO authenticated;

-- 2. Tighten screen_share_sessions RLS
-- SELECT: only screen monitors (Viraj/Kapil) or session owner
DROP POLICY IF EXISTS "select_share_sessions_auth" ON public.screen_share_sessions;
CREATE POLICY "select_share_sessions_auth"
  ON public.screen_share_sessions FOR SELECT
  TO authenticated
  USING (is_screen_monitor() OR auth.uid() = user_id);

-- INSERT: only non-monitors can create share sessions (Viraj/Kapil cannot share their screen)
DROP POLICY IF EXISTS "insert_own_share_session" ON public.screen_share_sessions;
CREATE POLICY "insert_own_share_session"
  ON public.screen_share_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND NOT is_screen_monitor());

-- UPDATE: owner or screen monitor
DROP POLICY IF EXISTS "update_own_share_session" ON public.screen_share_sessions;
CREATE POLICY "update_own_share_session"
  ON public.screen_share_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR is_screen_monitor())
  WITH CHECK (auth.uid() = user_id OR is_screen_monitor());

-- Remove old master-only update policy (replaced by above)
DROP POLICY IF EXISTS "update_share_sessions_master" ON public.screen_share_sessions;

-- DELETE: owner or screen monitor
DROP POLICY IF EXISTS "delete_own_share_session" ON public.screen_share_sessions;
CREATE POLICY "delete_own_share_session"
  ON public.screen_share_sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR is_screen_monitor());

-- Remove old master-only delete policy (replaced by above)
DROP POLICY IF EXISTS "delete_share_sessions_master" ON public.screen_share_sessions;

-- 3. Tighten signaling_messages RLS
-- Remove wide-open FOR ALL policy
DROP POLICY IF EXISTS "all_signaling_service_role" ON public.signaling_messages;

-- SELECT: authenticated only (edge function uses service role, bypasses RLS)
CREATE POLICY "signaling_select_auth"
  ON public.signaling_messages FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: authenticated only
CREATE POLICY "signaling_insert_auth"
  ON public.signaling_messages FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- DELETE: authenticated only
CREATE POLICY "signaling_delete_auth"
  ON public.signaling_messages FOR DELETE
  TO authenticated
  USING (true);
