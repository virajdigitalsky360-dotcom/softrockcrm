/*
# Remove Yuvraj completely from the CRM

Yuvraj (yuvrajpatelyuvrajpatel9090@gmail.com) is the only member of the
FREELANCE workspace and has zero tasks, attendance records, leaves, or
email logs. This migration:

1. Deletes Yuvraj's profile (removes CRM access — the auth.users row
   remains but can no longer log in to the CRM since the profile is
   what the app uses for authorization).
2. Deletes Yuvraj's team_members row (tasks FK is SET NULL, but there
   are zero tasks so nothing changes).
3. Deletes the empty FREELANCE workspace (Yuvraj was its only member).

No other user, task, permission, email, RLS, or CRM functionality
is affected.
*/

-- 1. Delete Yuvraj's profile
DELETE FROM public.profiles
WHERE id = '5328023e-484e-424f-8f95-022185548704';

-- 2. Delete Yuvraj's team_members row
DELETE FROM public.team_members
WHERE id = '173c26f6-d08d-4d73-984f-85d05b2c2336';

-- 3. Delete the empty FREELANCE workspace
DELETE FROM public.workspaces
WHERE id = '7ef1c626-c7bc-498c-93e5-8a41c300b2d2';
