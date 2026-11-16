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
