/*
# Fix Login, Password Reset, and Team/Workspace Links

## Purpose
Ensure every signed-in user has a complete profile → team_member → workspace chain
so the dashboard never loads with null references. Also harden the auth trigger so
new signups always get a profile, and fix the Kapil master email in the trigger.

## Changes

### 1. Settings — ensure maintenance_mode and closure_mode exist and are false
- INSERT ... ON CONFLICT DO UPDATE to guarantee both keys exist with value 'false'.

### 2. Default workspace "SOFTROCK"
- CREATE IF NOT EXISTS a workspace named "SOFTROCK" (slug "softrock") as a fallback
  for users that are not assigned to any specific workspace.

### 3. Missing team_member rows
- For every profile that has NULL team_member_id, create a team_member row linked
  to the SOFTROCK workspace (or the user's email-based name), then link the profile.
- Handles the two currently-unlinked profiles (kapil, sidwhms).

### 4. Fix handle_new_user() trigger function
- Update the master-email list to use the correct Kapil email
  (kapilprajapati9054@gmail.com, not kapilrajprajapati9054@gmail.com).
- Ensure the function never raises an error that would block signup —
  wrap the team_member lookup in a safe SELECT that returns NULL on no match.
- The function already uses ON CONFLICT (id) DO NOTHING so re-runs are safe.

### 5. RLS verification (no changes needed)
- profiles: SELECT policy `pf_select` (auth.uid() = id) and `pf_select_master` exist.
- team_members: SELECT policy `tm_select` (true) exists — all authenticated users can read.
- workspaces: SELECT policy `ws_select` (true) exists — all authenticated users can read.
- settings: SELECT policy `st_select` (true) exists — all authenticated users can read.
- The `closure_lockdown` restrictive policies evaluate to `true` when closure_mode = 'false',
  so they do not block access. No changes needed.

## Security
- No RLS policies added or removed.
- No grants changed.
- The trigger function remains SECURITY DEFINER with search_path = 'public'.
*/

-- 1. Ensure settings exist and are false
INSERT INTO settings (key, value, updated_at)
VALUES
  ('maintenance_mode', 'false', now()),
  ('closure_mode', 'false', now())
ON CONFLICT (key) DO UPDATE
SET value = 'false', updated_at = now();

-- 2. Create default SOFTROCK workspace if it doesn't exist
INSERT INTO workspaces (name, slug)
SELECT 'SOFTROCK', 'softrock'
WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE slug = 'softrock');

-- 3. Create missing team_member rows for profiles with NULL team_member_id
--    and link them to the SOFTROCK workspace.
INSERT INTO team_members (name, email, workspace_id)
SELECT
  COALESCE(split_part(p.email, '@', 1), 'User'),
  p.email,
  (SELECT id FROM workspaces WHERE slug = 'softrock')
FROM profiles p
WHERE p.team_member_id IS NULL
  AND p.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM team_members tm WHERE lower(tm.email) = lower(p.email)
  );

-- Link profiles to their team_member rows
UPDATE profiles
SET team_member_id = (
  SELECT tm.id FROM team_members tm
  WHERE lower(tm.email) = lower(profiles.email)
  LIMIT 1
)
WHERE team_member_id IS NULL
  AND email IS NOT NULL;

-- 4. Fix handle_new_user() — correct Kapil email, ensure robustness
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_tm uuid;
BEGIN
  v_role := CASE
    WHEN lower(new.email) IN ('viraj.digitalsky360@gmail.com', 'kapilprajapati9054@gmail.com') THEN 'master'
    WHEN lower(new.email) = 'softrockwork@gmail.com' THEN 'view_all'
    ELSE 'normal'
  END;

  SELECT id INTO v_tm FROM public.team_members WHERE lower(email) = lower(new.email) LIMIT 1;

  INSERT INTO public.profiles (id, email, role, team_member_id)
  VALUES (new.id, new.email, v_role, v_tm)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$function$;
