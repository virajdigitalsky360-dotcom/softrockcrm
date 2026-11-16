/*
# Fix Irfan in VIDEO EDITOR

The VIDEO EDITOR workspace has a team member named "irfan" (lowercase, no email).
This doesn't match Irfan's profile email, so:
- The RLS current_workspace_ids() function can't match it by email
- The frontend name lookup doesn't find it (it looks for "irfan" but display is inconsistent)

Fix: update the existing "irfan" row in VIDEO EDITOR to have proper name "Irfan"
and Irfan's actual email. This links it to Irfan's profile via the email-match
in current_workspace_ids(), giving Irfan task creation access in VIDEO EDITOR.
*/

UPDATE public.team_members
SET name = 'Irfan', email = 'irfankhan797651@gmail.com'
WHERE name = 'irfan' AND email IS NULL AND workspace_id = (
  SELECT id FROM public.workspaces WHERE slug = 'video-editor'
);
