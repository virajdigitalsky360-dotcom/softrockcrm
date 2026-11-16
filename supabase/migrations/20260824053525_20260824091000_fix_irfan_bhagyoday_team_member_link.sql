/*
# Fix Irfan & Bhagyoday: link profiles to team members, set emails

1. Overview
   Both Irfan and Bhagyoday have auth accounts and profile rows, but their
   profiles have team_member_id = NULL. The current_workspace_id() and
   current_team_member_id() helper functions depend on team_member_id being
   set, so all task RLS checks fail — they cannot create or manage tasks.
   This migration links each profile to the correct team member record and
   sets the email on the team_members row so the auth trigger can find it
   for future sign-ups.

2. Data changes
   - team_members: set Irfan's email to irfankhan797651@gmail.com
   - team_members: set Bhagyoday's email to bhagyodaypatel008@gmail.com
   - profiles: set Irfan's team_member_id to Irfan's team member UUID
   - profiles: set Bhagyoday's team_member_id to Bhagyoday's team member UUID

3. Auth trigger update
   - handle_new_user(): already links by email match on team_members.email.
     Now that team_members emails are set, new sign-ups for these emails
     will auto-link correctly.

4. Security
   - RLS is NOT disabled.
   - No policies are changed — the existing normal-role policies already
     allow workspace-scoped task management. The fix is purely data: linking
     profiles to team members so current_workspace_id() returns the right
     value.
   - No other users' permissions are changed.
   - Master accounts, Rostan's task_manager role, clients, tasks, and the
     email notification system are all untouched.

5. Important Notes
   - Irfan stays in GRAPHICS workspace, Bhagyoday stays in VIDEO EDITOR.
   - Irfan's 13 tasks and Bhagyoday's 10 tasks remain linked to their
     team_member_id — no tasks are moved or deleted.
   - No duplicate users are created.
*/

-- 1. Set emails on team_members records
UPDATE public.team_members
SET email = 'irfankhan797651@gmail.com'
WHERE name = 'Irfan' AND workspace_id = (
  SELECT id FROM public.workspaces WHERE slug = 'graphics'
);

UPDATE public.team_members
SET email = 'bhagyodaypatel008@gmail.com'
WHERE name = 'Bhagyoday' AND workspace_id = (
  SELECT id FROM public.workspaces WHERE slug = 'video-editor'
);

-- 2. Link profiles to team members
UPDATE public.profiles
SET team_member_id = (
  SELECT id FROM public.team_members
  WHERE name = 'Irfan' AND workspace_id = (
    SELECT id FROM public.workspaces WHERE slug = 'graphics'
  )
)
WHERE email = 'irfankhan797651@gmail.com';

UPDATE public.profiles
SET team_member_id = (
  SELECT id FROM public.team_members
  WHERE name = 'Bhagyoday' AND workspace_id = (
    SELECT id FROM public.workspaces WHERE slug = 'video-editor'
  )
)
WHERE email = 'bhagyodaypatel008@gmail.com';
