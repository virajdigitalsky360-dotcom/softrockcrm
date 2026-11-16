/*
# SOFTROCK CRM — Seed Data

1. Purpose
   Populates the CRM with the fixed SOFTROCK team structure, the three role
   definitions, a descriptive permission catalogue per role, and default
   system settings. Reference/config data only — no demo tasks, blank sticky note.

2. Workspaces (4): VIDEO EDITOR, FREELANCE, SOCIAL MEDIA, GRAPHICS
3. Team Members (5): Viraj, Bhagyoday (VIDEO EDITOR); Yuvraj (FREELANCE);
   Rostan (SOCIAL MEDIA); Irfan (GRAPHICS). Viraj's row carries the master
   email so the auth trigger auto-links his profile on signup.
4. Roles (3): master, view_all, normal
5. Permissions: descriptive list per role (used by the Master Panel).
6. Settings: brand_name = SOFTROCK, sticky_note_enabled = true
*/

-- workspaces
INSERT INTO public.workspaces (name, slug) VALUES
  ('VIDEO EDITOR','video-editor'),
  ('FREELANCE','freelance'),
  ('SOCIAL MEDIA','social-media'),
  ('GRAPHICS','graphics')
ON CONFLICT (name) DO NOTHING;

-- team members (exact names)
INSERT INTO public.team_members (name, workspace_id, email) VALUES
  ('Viraj',      (SELECT id FROM public.workspaces WHERE slug='video-editor'), 'viraj.digitalsky360@gmail.com'),
  ('Bhagyoday',  (SELECT id FROM public.workspaces WHERE slug='video-editor'), NULL),
  ('Yuvraj',     (SELECT id FROM public.workspaces WHERE slug='freelance'),     NULL),
  ('Rostan',     (SELECT id FROM public.workspaces WHERE slug='social-media'), NULL),
  ('Irfan',      (SELECT id FROM public.workspaces WHERE slug='graphics'),     NULL)
ON CONFLICT DO NOTHING;

-- roles
INSERT INTO public.roles (name, description) VALUES
  ('master',   'Full control over all tasks, clients, team members, workspaces, reports, permissions and system settings.'),
  ('view_all', 'Read-only access to the dashboard, all tasks, all workspaces and reports. Cannot modify any CRM data.'),
  ('normal',   'Standard team member. Can view and manage tasks within their own workspace only.')
ON CONFLICT (name) DO NOTHING;

-- permissions catalogue
INSERT INTO public.permissions (role_id, permission, description)
SELECT r.id, p.perm, p.description FROM public.roles r
JOIN (VALUES
  ('master','view_all_tasks','View every task across all workspaces'),
  ('master','manage_tasks','Create, edit, delete any task'),
  ('master','manage_clients','Create, edit, delete clients'),
  ('master','manage_team','Manage team members'),
  ('master','manage_workspaces','Manage workspaces'),
  ('master','view_reports','View and export reports'),
  ('master','export_excel','Export reports to Excel'),
  ('master','export_pdf','Export reports to PDF'),
  ('master','manage_permissions','Manage user roles and permissions'),
  ('master','manage_users','Manage user accounts'),
  ('master','access_master_panel','Access the Master Panel'),
  ('master','access_control_panel','Access the Control Panel'),
  ('master','system_settings','Change system settings'),
  ('view_all','view_all_tasks','View every task across all workspaces'),
  ('view_all','view_reports','View reports'),
  ('view_all','view_dashboard','View the dashboard'),
  ('normal','view_own_tasks','View tasks within own workspace'),
  ('normal','manage_own_tasks','Create, edit tasks within own workspace')
) AS p(role, perm, description) ON p.role = r.name
ON CONFLICT DO NOTHING;

-- default settings
INSERT INTO public.settings (key, value) VALUES
  ('brand_name','SOFTROCK'),
  ('sticky_note_enabled','true')
ON CONFLICT (key) DO NOTHING;