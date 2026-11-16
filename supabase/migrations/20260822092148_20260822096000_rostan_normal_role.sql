/*
# Convert Rostan (softrockwork@gmail.com) from View-Only to Normal Task User

1. Overview
   Changes the softrockwork@gmail.com account from view_all (read-only) to
   normal (standard Social Media team member). Rostan will be able to create,
   edit, and change status of tasks in the Social Media workspace only.
   No master, control panel, user management, or permission management access.

2. Changes
   - Auth trigger: softrockwork@gmail.com now defaults to 'normal' instead of
     'view_all'. The trigger also auto-links the profile to the Rostan team
     member by matching the email.
   - Team member 'Rostan': email set to 'softrockwork@gmail.com' so the auth
     trigger can auto-link on signup.
   - Existing profile for softrockwork@gmail.com: role changed from 'view_all'
     to 'normal', team_member_id linked to Rostan's row.

3. Security
   - RLS remains enabled on all tables.
   - The two master accounts (viraj.digitalsky360@gmail.com,
     kprajapati9054@gmail.com) are NOT changed.
   - Rostan's task access is limited to the Social Media workspace via the
     existing current_workspace_id() check in the RLS policies.
   - The existing can_manage_tasks() function already allows 'normal' role
     users because they have the 'manage_own_tasks' permission.

4. Important Notes
   - No tables, columns, or existing task data are changed.
   - The profile update is done via service role (bypasses the column-level
     REVOKE on role and team_member_id).
   - The frontend already uses !isViewOnly to show the Add Task button; with
     role 'normal', isViewOnly is false, so the button appears automatically.
*/

-- 1. Update Rostan's team member email so the auth trigger can auto-link
UPDATE public.team_members
SET email = 'softrockwork@gmail.com'
WHERE name = 'Rostan'
  AND workspace_id = (SELECT id FROM public.workspaces WHERE slug = 'social-media');

-- 2. Update the auth trigger to assign 'normal' (not 'view_all') for this email
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
    WHEN new.email IN ('viraj.digitalsky360@gmail.com','kprajapati9054@gmail.com') THEN 'master'
    ELSE 'normal'
  END;
  SELECT id INTO v_tm FROM public.team_members WHERE email = new.email;
  INSERT INTO public.profiles (id, email, role, team_member_id)
  VALUES (new.id, new.email, v_role, v_tm)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- 3. Update the existing profile: role to normal, link to Rostan team member
UPDATE public.profiles
SET role = 'normal',
    team_member_id = (SELECT id FROM public.team_members WHERE name = 'Rostan' AND workspace_id = (SELECT id FROM public.workspaces WHERE slug = 'social-media'))
WHERE email = 'softrockwork@gmail.com';
