import { useState, FormEvent, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useWorkspaces, useTeamMembers, useClients, useTasks } from '@/lib/hooks';
import type { TeamMember, Workspace, Client, Profile, RoleRow, PermissionRow, Setting, EmailNotificationSetting, CentralizedEmailLog, AbsentSubmission } from '@/lib/types';
import { Card, PageLoader, EmptyState, Button, Input, Select, Textarea, Modal, StatusBadge } from '@/components/ui';
import {
  Users as UsersIcon, Building2, Briefcase, ShieldCheck, FileBarChart,
  Database, Settings as SettingsIcon, Plus, Pencil, Trash2, Save, Bell, Mail, Check, X,
  CalendarDays, ClipboardCheck, Camera, KeyRound, Copy, RotateCcw, Eye, EyeOff, Send,
  Monitor as MonitorIcon,
} from 'lucide-react';
import { useHolidays, getNextSundays } from '@/lib/useHolidays';
import type { OfficeHoliday } from '@/lib/types';
import ScreenMonitoring from '@/components/ScreenMonitoring';
import { getAbsentScreenshotStoragePath } from '@/lib/useAbsentLock';

type Tab = 'team' | 'clients' | 'workspaces' | 'permissions' | 'reports' | 'settings' | 'all-tasks' | 'database' | 'email-notifications' | 'holidays' | 'absent-verifications' | 'credentials' | 'screen-monitoring';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'team', label: 'Team Management', icon: <UsersIcon className="h-4 w-4" /> },
  { id: 'clients', label: 'Client Management', icon: <Building2 className="h-4 w-4" /> },
  { id: 'workspaces', label: 'Workspace Management', icon: <Briefcase className="h-4 w-4" /> },
  { id: 'permissions', label: 'User Permissions', icon: <ShieldCheck className="h-4 w-4" /> },
  { id: 'email-notifications', label: 'Email Notifications', icon: <Mail className="h-4 w-4" /> },
  { id: 'holidays', label: 'Holiday Control', icon: <CalendarDays className="h-4 w-4" /> },
  { id: 'absent-verifications', label: 'Absent Verifications', icon: <ClipboardCheck className="h-4 w-4" /> },
  { id: 'reports', label: 'Reports', icon: <FileBarChart className="h-4 w-4" /> },
  { id: 'settings', label: 'System Settings', icon: <SettingsIcon className="h-4 w-4" /> },
  { id: 'all-tasks', label: 'All Tasks', icon: <FileBarChart className="h-4 w-4" /> },
  { id: 'database', label: 'Database Controls', icon: <Database className="h-4 w-4" /> },
  { id: 'credentials', label: 'Credentials', icon: <KeyRound className="h-4 w-4" /> },
  { id: 'screen-monitoring', label: 'Team Screen Monitoring', icon: <MonitorIcon className="h-4 w-4" /> },
];

const PRIMARY_MASTER_EMAIL = 'viraj.digitalsky360@gmail.com';

export default function MasterPanel() {
  const { user, isMaster } = useAuth();
  const [tab, setTab] = useState<Tab>('team');

  const isPrimaryMaster = user?.email?.toLowerCase() === PRIMARY_MASTER_EMAIL;
  const visibleTabs = TABS.filter((t) =>
    (!isMaster ? t.id === 'all-tasks' : true) &&
    (t.id !== 'email-notifications' || isPrimaryMaster) &&
    (t.id !== 'holidays' || isPrimaryMaster) &&
    (t.id !== 'absent-verifications' || isPrimaryMaster) &&
    (t.id !== 'credentials' || isPrimaryMaster) &&
    (t.id !== 'screen-monitoring' || isPrimaryMaster || user?.email?.toLowerCase() === 'kapilprajapati9054@gmail.com')
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-[#17243d]">
          <ShieldCheck className="h-5 w-5 text-[#1478d4]" /> {isMaster ? 'Master Panel' : 'Task Manager'}
        </h1>
        <p className="text-sm text-[#5a6c84]">{isMaster ? 'Full control over SOFTROCK CRM' : 'View and track all tasks across workspaces'}</p>
      </div>

      {/* tabs */}
      <div className="flex flex-wrap gap-1.5">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200 hover:scale-[1.03] active:scale-95 ${
              tab === t.id ? 'bg-cyan-500/15 text-[#17243d]' : 'text-[#5a6c84] hover:bg-cyan-500/10 hover:text-[#3d5070]'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'team' && <TeamTab />}
      {tab === 'clients' && <ClientsTab />}
      {tab === 'workspaces' && <WorkspacesTab />}
      {tab === 'permissions' && <PermissionsTab />}
      {tab === 'email-notifications' && (isPrimaryMaster ? <EmailNotificationsTab /> : <AccessDenied />)}
      {tab === 'holidays' && (isPrimaryMaster ? <HolidaysTab /> : <AccessDenied />)}
      {tab === 'absent-verifications' && <AbsentVerificationsTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'all-tasks' && <AllTasksTab />}
      {tab === 'database' && <DatabaseTab />}
      {tab === 'credentials' && (isPrimaryMaster ? <CredentialsTab /> : <AccessDenied />)}
      {tab === 'screen-monitoring' && ((isPrimaryMaster || user?.email?.toLowerCase() === 'kapilprajapati9054@gmail.com') ? <ScreenMonitoring /> : <AccessDenied />)}
    </div>
  );
}

function AccessDenied() {
  return (
    <Card className="p-8 text-center">
      <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-[#3d5070]" />
      <p className="text-sm text-[#5a6c84]">You do not have access to this section.</p>
    </Card>
  );
}

// ---------- Team ----------
function TeamTab() {
  const { members, loading, reload } = useTeamMembers();
  const { workspaces } = useWorkspaces();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [wsId, setWsId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openNew() { setEditing(null); setName(''); setEmail(''); setWsId(''); setError(null); setOpen(true); }
  function openEdit(m: TeamMember) { setEditing(m); setName(m.name); setEmail(m.email ?? ''); setWsId(m.workspace_id ?? ''); setError(null); setOpen(true); }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setBusy(true); setError(null);
    const payload = { name: name.trim(), email: email || null, workspace_id: wsId || null };
    const res = editing ? await supabase.from('team_members').update(payload).eq('id', editing.id) : await supabase.from('team_members').insert(payload);
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    setOpen(false); reload();
  }

  async function remove(m: TeamMember) {
    if (!confirm(`Remove ${m.name} from the team?`)) return;
    await supabase.from('team_members').delete().eq('id', m.id);
    reload();
  }

  if (loading) return <PageLoader />;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#e5ebf3] px-5 py-4">
        <h2 className="text-sm font-semibold text-[#17243d]">Team Members</h2>
        <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5" /> Add Member</Button>
      </div>
      <div className="divide-y divide-[#edf1f6]">
        {members.map((m) => (
          <div key={m.id} className="group flex items-center gap-3 px-5 py-3 transition-all duration-200 hover:bg-cyan-500/[0.04]">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-cyan-500/10 text-xs font-semibold text-[#3d5070]">{m.name.charAt(0)}</div>
            <div className="flex-1">
              <p className="text-sm font-medium text-[#17243d]">{m.name}</p>
              <p className="text-xs text-[#5a6c84]">{m.email ?? 'No email'} · {m.workspace?.name ?? 'No workspace'}</p>
            </div>
            <div className="flex gap-1 opacity-0 transition-all duration-200 group-hover:opacity-100">
              <button onClick={() => openEdit(m)} className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] transition-all duration-200 hover:bg-cyan-500/10 hover:text-[#17243d] hover:scale-110 active:scale-95"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => remove(m)} className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] transition-all duration-200 hover:bg-red-500/10 hover:text-red-600 hover:scale-110 active:scale-95"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Member' : 'Add Member'}>
        <form onSubmit={save} className="space-y-4">
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Email (optional, links to auth account)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Select label="Workspace" value={wsId} onChange={(e) => setWsId(e.target.value)}>
            <option value="">No workspace</option>
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
          {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

// ---------- Clients ----------
function ClientsTab() {
  const { clients, loading, reload } = useClients();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openNew() { setEditing(null); setName(''); setEmail(''); setPhone(''); setNotes(''); setError(null); setOpen(true); }
  function openEdit(c: Client) { setEditing(c); setName(c.name); setEmail(c.email ?? ''); setPhone(c.phone ?? ''); setNotes(c.notes ?? ''); setError(null); setOpen(true); }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name required'); return; }
    setBusy(true); setError(null);
    const payload = { name: name.trim(), email: email || null, phone: phone || null, notes: notes.trim() || null };
    const res = editing ? await supabase.from('clients').update(payload).eq('id', editing.id) : await supabase.from('clients').insert(payload);
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    setOpen(false); reload();
  }

  async function remove(c: Client) {
    if (!confirm(`Delete client "${c.name}"?`)) return;
    await supabase.from('clients').delete().eq('id', c.id);
    reload();
  }

  if (loading) return <PageLoader />;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#e5ebf3] px-5 py-4">
        <h2 className="text-sm font-semibold text-[#17243d]">Clients</h2>
        <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5" /> Add Client</Button>
      </div>
      <div className="divide-y divide-[#edf1f6]">
        {clients.map((c) => (
          <div key={c.id} className="group flex items-center gap-3 px-5 py-3 transition-all duration-200 hover:bg-cyan-500/[0.04]">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-500/10"><Building2 className="h-4 w-4 text-[#1478d4]" /></div>
            <div className="flex-1">
              <p className="text-sm font-medium text-[#17243d]">{c.name}</p>
              <p className="text-xs text-[#5a6c84]">{c.email ?? 'No email'} · {c.phone ?? 'No phone'}</p>
            </div>
            <div className="flex gap-1 opacity-0 transition-all duration-200 group-hover:opacity-100">
              <button onClick={() => openEdit(c)} className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] transition-all duration-200 hover:bg-cyan-500/10 hover:text-[#17243d] hover:scale-110 active:scale-95"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => remove(c)} className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] transition-all duration-200 hover:bg-red-500/10 hover:text-red-600 hover:scale-110 active:scale-95"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
        {clients.length === 0 && <EmptyState title="No clients" />}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Client' : 'Add Client'}>
        <form onSubmit={save} className="space-y-4">
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

// ---------- Workspaces ----------
function WorkspacesTab() {
  const { workspaces, loading, reload } = useWorkspaces();
  const { members } = useTeamMembers();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Workspace | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openNew() { setEditing(null); setName(''); setSlug(''); setError(null); setOpen(true); }
  function openEdit(w: Workspace) { setEditing(w); setName(w.name); setSlug(w.slug); setError(null); setOpen(true); }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) { setError('Name and slug required'); return; }
    setBusy(true); setError(null);
    const payload = { name: name.trim(), slug: slug.trim().toLowerCase().replace(/\s+/g, '-') };
    const res = editing ? await supabase.from('workspaces').update(payload).eq('id', editing.id) : await supabase.from('workspaces').insert(payload);
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    setOpen(false); reload();
  }

  async function remove(w: Workspace) {
    const count = members.filter((m) => m.workspace_id === w.id).length;
    if (count > 0) { alert(`Cannot delete: ${count} team member(s) are in this workspace.`); return; }
    if (!confirm(`Delete workspace "${w.name}"?`)) return;
    await supabase.from('workspaces').delete().eq('id', w.id);
    reload();
  }

  if (loading) return <PageLoader />;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#e5ebf3] px-5 py-4">
        <h2 className="text-sm font-semibold text-[#17243d]">Workspaces</h2>
        <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5" /> Add Workspace</Button>
      </div>
      <div className="divide-y divide-[#edf1f6]">
        {workspaces.map((w) => {
          const count = members.filter((m) => m.workspace_id === w.id).length;
          return (
            <div key={w.id} className="group flex items-center gap-3 px-5 py-3 transition-all duration-200 hover:bg-cyan-500/[0.04]">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-500/10"><Briefcase className="h-4 w-4 text-sky-600" /></div>
              <div className="flex-1">
                <p className="text-sm font-medium text-[#17243d]">{w.name}</p>
                <p className="text-xs text-[#5a6c84]">/{w.slug} · {count} member{count !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex gap-1 opacity-0 transition-all duration-200 group-hover:opacity-100">
                <button onClick={() => openEdit(w)} className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] transition-all duration-200 hover:bg-cyan-500/10 hover:text-[#17243d] hover:scale-110 active:scale-95"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => remove(w)} className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] transition-all duration-200 hover:bg-red-500/10 hover:text-red-600 hover:scale-110 active:scale-95"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Workspace' : 'Add Workspace'}>
        <form onSubmit={save} className="space-y-4">
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Slug (URL)" required value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="e.g. video-editor" />
          {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

// ---------- Permissions ----------
function PermissionsTab() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [perms, setPerms] = useState<PermissionRow[]>([]);
  const [taskMgrAccess, setTaskMgrAccess] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const { refreshProfile } = useAuth();

  async function load() {
    const [p, r, pm, tm] = await Promise.all([
      supabase.from('profiles').select('*, team_member:team_members(*)').order('created_at', { ascending: false }),
      supabase.from('roles').select('*').order('name'),
      supabase.from('permissions').select('*, role:roles(*)').order('permission'),
      supabase.from('user_access_settings').select('user_id, task_manager_access'),
    ]);
    if (p.data) setProfiles(p.data as unknown as Profile[]);
    if (r.data) setRoles(r.data as RoleRow[]);
    if (pm.data) setPerms(pm.data as PermissionRow[]);
    if (tm.data) {
      const map: Record<string, boolean> = {};
      for (const row of tm.data as unknown as { user_id: string; task_manager_access: boolean }[]) {
        map[row.user_id] = row.task_manager_access;
      }
      setTaskMgrAccess(map);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function changeRole(profileId: string, role: string) {
    const { error } = await supabase.rpc('set_user_role', { p_user_id: profileId, p_role: role });
    if (error) {
      alert('Could not change role: ' + error.message);
      return;
    }
    load();
    refreshProfile();
  }

  async function toggleTaskManagerAccess(profileId: string, enabled: boolean) {
    const { error } = await supabase
      .from('user_access_settings')
      .upsert({ user_id: profileId, task_manager_access: enabled }, { onConflict: 'user_id' });
    if (error) {
      alert('Could not update Task Manager access: ' + error.message);
      return;
    }
    setTaskMgrAccess((prev) => ({ ...prev, [profileId]: enabled }));
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="border-b border-[#e5ebf3] px-5 py-4">
          <h2 className="text-sm font-semibold text-[#17243d]">User Permissions</h2>
          <p className="text-xs text-[#5a6c84]">Assign roles to signed-up users. Role changes are enforced at the database level.</p>
        </div>
        <div className="divide-y divide-[#edf1f6]">
          {profiles.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-5 py-3 transition-all duration-200 hover:bg-cyan-500/[0.04]">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-cyan-500/10 text-xs font-semibold text-[#3d5070]">
                {(p.display_name || p.email || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-[#17243d]">{p.display_name || p.email}</p>
                <p className="text-xs text-[#5a6c84]">{p.email} · {p.team_member?.name ?? 'No team link'}</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[#5a6c84]" title="Grant access to the Task Manager page without changing role">
                  <input
                    type="checkbox"
                    checked={taskMgrAccess[p.id] === true}
                    onChange={(e) => toggleTaskManagerAccess(p.id, e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-[#e5ebf3] accent-[#1478d4]"
                  />
                  Task Manager
                </label>
                <select
                  value={p.role}
                  onChange={(e) => changeRole(p.id, e.target.value)}
                  className="rounded-lg border border-[#e5ebf3] bg-[#fbfcfe] px-2.5 py-1.5 text-xs text-[#17243d] outline-none focus:border-cyan-400 [&>option]:bg-white"
                >
                  <option value="normal">Normal</option>
                  <option value="view_all">View All</option>
                  <option value="master">Master</option>
                </select>
              </div>
            </div>
          ))}
          {profiles.length === 0 && <EmptyState title="No users have signed up yet" />}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-[#e5ebf3] px-5 py-4">
          <h2 className="text-sm font-semibold text-[#17243d]">Role & Permission Catalogue</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
          {roles.map((r) => (
            <div key={r.id} className="rounded-xl border border-[#e5ebf3] bg-cyan-500/[0.03] p-4 transition-all duration-200 hover:border-cyan-400/40 hover:bg-cyan-500/[0.05]">
              <h3 className="mb-1 text-sm font-semibold capitalize text-[#17243d]">{r.name.replace('_', ' ')}</h3>
              <p className="mb-3 text-xs text-[#5a6c84]">{r.description}</p>
              <ul className="space-y-1">
                {perms.filter((p) => p.role_id === r.id).map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-xs text-[#5a6c84]">
                    <ShieldCheck className="h-3 w-3 text-[#1478d4]/60" /> {p.permission.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------- Reports shortcut ----------
function ReportsTab() {
  return (
    <Card className="p-6">
      <p className="text-sm text-[#3d5070]">Reports and exports are available in the dedicated Reports section.</p>
      <a href="/reports" className="mt-3 inline-flex items-center gap-2 text-sm text-[#1478d4] hover:underline">
        <FileBarChart className="h-4 w-4" /> Go to Reports
      </a>
    </Card>
  );
}

// ---------- Settings ----------
function SettingsTab() {
  const { user, session, isMaster } = useAuth();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [notificationStatus, setNotificationStatus] = useState<string | null>(null);
  const [testEmailStatus, setTestEmailStatus] = useState<string | null>(null);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  const canTestNotifications = user?.email?.toLowerCase() === 'viraj.digitalsky360@gmail.com';
  const canSendTestAttendanceEmail = isMaster && (
    user?.email?.toLowerCase() === 'viraj.digitalsky360@gmail.com' ||
    user?.email?.toLowerCase() === 'kapilprajapati9054@gmail.com'
  );

  async function sendTestAttendanceEmail() {
    if (!confirm('Send a TEST attendance email to both Viraj and Kapil?\n\nThis is only a test — it will NOT create attendance records or count as an absence report.')) return;
    setSendingTestEmail(true);
    setTestEmailStatus(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const response = await fetch(`${supabaseUrl}/functions/v1/test-attendance-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
      });
      const result = await response.json().catch(() => ({ error: 'Request failed' }));
      if (!response.ok) {
        setTestEmailStatus(`Failed: ${result.error ?? response.status}`);
      } else {
        setTestEmailStatus('Test email sent to Viraj and Kapil successfully.');
      }
    } catch {
      setTestEmailStatus('Failed: could not reach the server.');
    }
    setSendingTestEmail(false);
  }

  async function testDesktopNotification() {
    if (!('Notification' in window)) {
      setNotificationStatus('Desktop notifications are not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission === 'granted') {
      new Notification('Task Inactivity Alert – TEST', {
        body: 'This is a test notification from Softrock Task Manager.',
        icon: '/ICON.jpg',
      });
      setNotificationStatus('Test notification sent.');
    } else {
      setNotificationStatus('Notifications are blocked. In Chrome or Edge, click the lock icon beside the website address, allow Notifications, then reload this page.');
    }
  }
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await supabase.from('settings').select('*').order('key');
    if (data) {
      const editableSettings = (data as Setting[]).filter((setting) => !setting.key.startsWith('closure') && setting.key !== 'maintenance_mode' && setting.key !== 'kapil_master_access');
      setSettings(editableSettings);
      setDraft(Object.fromEntries(editableSettings.map((setting) => [setting.key, setting.value ?? ''])));
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    for (const s of settings) {
      if (draft[s.key] !== (s.value ?? '')) {
        await supabase.from('settings').update({ value: draft[s.key], updated_at: new Date().toISOString() }).eq('id', s.id);
      }
    }
    setSaving(false);
    load();
  }

  if (loading) return <PageLoader />;

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold text-[#17243d]">System Settings</h2>
      <div className="space-y-3">
        {settings.map((s) => (
          <div key={s.id} className="flex items-center gap-3">
            <span className="w-48 text-xs text-[#5a6c84]">{s.key}</span>
            <input
              value={draft[s.key] ?? ''}
              onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })}
              className="flex-1 rounded-lg border border-[#e5ebf3] bg-[#fbfcfe] px-3 py-2 text-sm text-[#17243d] outline-none focus:border-cyan-400"
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={saving}><Save className="h-3.5 w-3.5" /> {saving ? 'Saving...' : 'Save Settings'}</Button>
      </div>
      {canTestNotifications && (
        <div className="mt-6 border-t border-[#e5ebf3] pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#17243d]">Desktop Notifications</h3>
              <p className="mt-1 text-xs text-[#5a6c84]">Send a browser notification to verify task inactivity alerts.</p>
            </div>
            <Button variant="subtle" onClick={testDesktopNotification}>
              <Bell className="h-3.5 w-3.5" /> Test Desktop Notification
            </Button>
          </div>
          {notificationStatus && <p className="mt-3 text-xs text-[#5a6c84]">{notificationStatus}</p>}
        </div>
      )}

      {canSendTestAttendanceEmail && (
        <div className="mt-6 border-t border-[#e5ebf3] pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#17243d]">Attendance Email Test</h3>
              <p className="mt-1 text-xs text-[#5a6c84]">Send a test email to both Viraj and Kapil to verify attendance email delivery. This does NOT create attendance records or count as an absence report.</p>
            </div>
            <Button
              variant="subtle"
              onClick={sendTestAttendanceEmail}
              disabled={sendingTestEmail}
            >
              {sendingTestEmail
                ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#1478d4]/30 border-t-[#1478d4]" />
                : <Send className="h-3.5 w-3.5" />}
              {sendingTestEmail ? 'Sending...' : 'Send Test Attendance Email'}
            </Button>
          </div>
          {testEmailStatus && (
            <p className={`mt-3 text-xs ${testEmailStatus.startsWith('Failed') ? 'text-red-600' : 'text-emerald-600'}`}>{testEmailStatus}</p>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------- All Tasks ----------
export function AllTasksTab() {
  const { tasks, loading } = useTasks();
  if (loading) return <PageLoader />;
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[#e5ebf3] px-5 py-4">
        <h2 className="text-sm font-semibold text-[#17243d]">All Tasks ({tasks.length})</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e5ebf3] text-left text-xs text-[#5a6c84]">
              <th className="px-4 py-3 font-medium">Task</th>
              <th className="px-4 py-3 font-medium">Person</th>
              <th className="px-4 py-3 font-medium">Workspace</th>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf1f6]">
            {tasks.map((t) => (
              <tr key={t.id} className="transition-all duration-200 hover:bg-cyan-500/[0.05]">
                <td className="px-4 py-3 font-medium text-[#17243d]">{t.name}</td>
                <td className="px-4 py-3 text-[#3d5070]">{t.team_member?.name ?? '—'}</td>
                <td className="px-4 py-3 text-[#5a6c84]">{t.workspace?.name ?? '—'}</td>
                <td className="px-4 py-3 text-[#3d5070]">{t.client?.name ?? '—'}</td>
                <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                <td className="px-4 py-3 text-[#5a6c84]">{t.due_date ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- Email Notifications ----------
function EmailNotificationsTab() {
  const { members, loading } = useTeamMembers();
  const [settings, setSettings] = useState<EmailNotificationSetting[]>([]);
  const [logs, setLogs] = useState<CentralizedEmailLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  async function load() {
    const [s, l] = await Promise.all([
      supabase.from('email_notification_settings').select('*, team_member:team_members(*)').order('team_member(name)'),
      supabase.from('centralized_email_logs').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    if (s.data) setSettings(s.data as unknown as EmailNotificationSetting[]);
    if (l.data) setLogs(l.data as unknown as CentralizedEmailLog[]);
  }

  useEffect(() => { if (!loading) load(); }, [loading]);

  async function toggleSetting(settingId: string, field: 'email_enabled' | 'notify_pending_tasks' | 'notify_leave_events' | 'notify_inactivity', value: boolean) {
    setBusy(true);
    await supabase.from('email_notification_settings').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', settingId);
    setBusy(false);
    load();
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="border-b border-[#e5ebf3] px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#17243d]">
            <Mail className="h-4 w-4 text-[#1478d4]" /> Email Notification Settings
          </h2>
          <p className="mt-1 text-xs text-[#5a6c84]">
            Control which team members receive email notifications and which types. All emails use a single centralized sender.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e5ebf3] text-left text-xs text-[#5a6c84]">
                <th className="px-4 py-3 font-medium">Team Member</th>
                <th className="px-4 py-3 text-center font-medium">Email Enabled</th>
                <th className="px-4 py-3 text-center font-medium">Pending Tasks</th>
                <th className="px-4 py-3 text-center font-medium">Leave Events</th>
                <th className="px-4 py-3 text-center font-medium">Inactivity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1f6]">
              {settings.map((s) => (
                <tr key={s.id} className="transition-all duration-200 hover:bg-cyan-500/[0.04]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#17243d]">{s.team_member?.name ?? 'Unknown'}</p>
                    <p className="text-xs text-[#5a6c84]">{s.team_member?.email ?? 'No email'}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Toggle checked={s.email_enabled} disabled={busy} onChange={(v) => toggleSetting(s.id, 'email_enabled', v)} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Toggle checked={s.notify_pending_tasks} disabled={busy || !s.email_enabled} onChange={(v) => toggleSetting(s.id, 'notify_pending_tasks', v)} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Toggle checked={s.notify_leave_events} disabled={busy || !s.email_enabled} onChange={(v) => toggleSetting(s.id, 'notify_leave_events', v)} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Toggle checked={s.notify_inactivity} disabled={busy || !s.email_enabled} onChange={(v) => toggleSetting(s.id, 'notify_inactivity', v)} />
                  </td>
                </tr>
              ))}
              {settings.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-[#5a6c84]">No notification settings found. Team members will be seeded automatically.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#e5ebf3] px-5 py-4">
          <h2 className="text-sm font-semibold text-[#17243d]">Recent Email Activity</h2>
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="text-xs text-[#1478d4] hover:underline"
          >
            {showLogs ? 'Hide' : 'Show'} last 50 emails
          </button>
        </div>
        {showLogs && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e5ebf3] text-left text-xs text-[#5a6c84]">
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Recipient</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1f6]">
                {logs.map((log) => (
                  <tr key={log.id} className="transition-all duration-200 hover:bg-cyan-500/[0.04]">
                    <td className="px-4 py-3 text-xs text-[#5a6c84]">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-[#3d5070]">{log.recipient_email}</td>
                    <td className="px-4 py-3 text-[#5a6c84]">{log.notification_type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">
                      {log.status === 'sent'
                        ? <span className="inline-flex items-center gap-1 text-xs text-[#1478d4]"><Check className="h-3 w-3" /> Sent</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-red-600"><X className="h-3 w-3" /> Failed</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-red-600">{log.error_message ?? '—'}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-[#5a6c84]">No email activity yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-200 ${
        checked ? 'bg-cyan-500' : 'bg-cyan-500/15'
      } ${disabled ? 'opacity-40' : 'cursor-pointer hover:scale-105'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-all duration-200 ${
        checked ? 'translate-x-4.5' : 'translate-x-1'
      }`} style={{ transform: checked ? 'translateX(18px)' : 'translateX(3px)' }} />
    </button>
  );
}

// ---------- Database ----------
function DatabaseTab() {
  const { tasks } = useTasks();
  const { clients } = useClients();
  const { members } = useTeamMembers();
  const { workspaces } = useWorkspaces();
  const [profiles, setProfiles] = useState(0);

  useEffect(() => {
    supabase.from('profiles').select('*', { count: 'exact', head: true }).then(({ count }) => setProfiles(count ?? 0));
  }, []);

  const rows = [
    { label: 'tasks', count: tasks.length },
    { label: 'clients', count: clients.length },
    { label: 'team_members', count: members.length },
    { label: 'workspaces', count: workspaces.length },
    { label: 'profiles', count: profiles },
  ];

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold text-[#17243d]">Database Overview</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {rows.map((r) => (
          <div key={r.label} className="rounded-xl border border-[#e5ebf3] bg-cyan-500/[0.03] p-4 transition-all duration-200 hover:border-cyan-400/40 hover:bg-cyan-500/[0.05]">
            <p className="text-xs text-[#5a6c84]">{r.label}</p>
            <p className="text-2xl font-semibold text-[#17243d]">{r.count}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-[#5a6c84]">Row Level Security is enabled on all tables. Data is protected at the database level.</p>
    </Card>
  );
}

// ---------- Holiday Control ----------
function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00+05:30');
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function isSunday(dateStr: string): boolean {
  const date = new Date(dateStr + 'T12:00:00+05:30');
  return date.getDay() === 0;
}

function HolidaysTab() {
  const { holidays, loading, addHoliday, updateHoliday, removeHoliday, reload } = useHolidays();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OfficeHoliday | null>(null);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextSundays = getNextSundays(4);

  function openNew() {
    setEditing(null);
    setDate('');
    setName('');
    setError(null);
    setOpen(true);
  }

  function openEdit(h: OfficeHoliday) {
    setEditing(h);
    setDate(h.holiday_date);
    setName(h.holiday_name);
    setError(null);
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!date.trim() || !name.trim()) {
      setError('Date and name are required');
      return;
    }
    if (isSunday(date)) {
      setError('That date is a Sunday — Sundays are automatically non-working days. No holiday entry needed.');
      return;
    }
    setBusy(true);
    setError(null);
    if (editing) {
      const { error: err } = await updateHoliday(editing.id, date, name.trim());
      if (err) { setError(err); setBusy(false); return; }
    } else {
      const { error: err } = await addHoliday(date, name.trim());
      if (err) { setError(err); setBusy(false); return; }
    }
    setBusy(false);
    setOpen(false);
    reload();
  }

  async function remove(h: OfficeHoliday) {
    if (!confirm(`Remove the office holiday on ${formatDateDisplay(h.holiday_date)} — "${h.holiday_name}"?`)) return;
    await removeHoliday(h.id);
    reload();
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      {/* Holiday Management Table */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#e5ebf3] px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[#17243d]">
              <CalendarDays className="h-4 w-4 text-emerald-600" /> Office Holidays
            </h2>
            <p className="mt-0.5 text-xs text-[#5a6c84]">Manually-added holidays. Sundays are automatic and not listed here.</p>
          </div>
          <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5" /> Add Holiday</Button>
        </div>
        <div className="divide-y divide-[#edf1f6]">
          {holidays.length === 0 && (
            <div className="px-5 py-8 text-center">
              <CalendarDays className="mx-auto mb-2 h-8 w-8 text-[#3d5070]" />
              <p className="text-sm text-[#5a6c84]">No office holidays added yet</p>
              <p className="mt-1 text-xs text-[#3d5070]">Use the AI chatbot (bottom-left) or click "Add Holiday" to create one.</p>
            </div>
          )}
          {holidays.map((h) => (
            <div key={h.id} className="group flex items-center gap-3 px-5 py-3 transition-all duration-200 hover:bg-emerald-500/[0.03]">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/10">
                <CalendarDays className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-[#17243d]">{h.holiday_name}</p>
                <p className="text-xs text-[#5a6c84]">{formatDateDisplay(h.holiday_date)}</p>
              </div>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] uppercase text-emerald-700">Active</span>
              <div className="flex gap-1 opacity-0 transition-all duration-200 group-hover:opacity-100">
                <button onClick={() => openEdit(h)} className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] transition-all duration-200 hover:bg-cyan-500/10 hover:text-[#17243d] hover:scale-110 active:scale-95"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => remove(h)} className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] transition-all duration-200 hover:bg-red-500/10 hover:text-red-600 hover:scale-110 active:scale-95"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Automatic Sundays */}
      <Card className="overflow-hidden">
        <div className="border-b border-[#e5ebf3] px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#17243d]">
            <CalendarDays className="h-4 w-4 text-sky-600" /> Automatic Sundays
          </h2>
          <p className="mt-0.5 text-xs text-[#5a6c84]">Every Sunday is automatically a non-working day. No manual entry needed — all automatic systems skip Sundays.</p>
        </div>
        <div className="divide-y divide-[#edf1f6]">
          {nextSundays.map((s) => (
            <div key={s} className="flex items-center gap-3 px-5 py-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-sky-500/10">
                <CalendarDays className="h-4 w-4 text-sky-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-[#17243d]">Sunday</p>
                <p className="text-xs text-[#5a6c84]">{formatDateDisplay(s)}</p>
              </div>
              <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-[10px] uppercase text-sky-700">Auto</span>
            </div>
          ))}
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Holiday' : 'Add Holiday'}>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-[#5a6c84]">Holiday Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-[#e5ebf3] bg-[#fbfcfe] px-3 py-2 text-sm text-[#17243d] outline-none focus:border-emerald-400"
            />
          </div>
          <Input label="Holiday Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Janmashtami, Diwali, Office Closed" />
          {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ---------- Absent Verifications ----------
function reasonLabel(reason: string): string {
  switch (reason) {
    case 'crm_down': return 'CRM was down';
    case 'no_task_assigned': return 'No task was assigned to me';
    case 'forgot_to_add_task': return 'I forgot to add the task';
    case 'other': return 'Other';
    default: return reason;
  }
}

function crmDownLabel(status: string | null): string {
  if (!status) return '';
  if (status === 'verified') return 'CRM Down — Verified';
  if (status === 'not_verified') return 'CRM Down — Not Verified';
  return status;
}

interface SubmissionAudit {
  submission: AbsentSubmission;
  attendance?: {
    check_timestamp: string | null;
    task_count_at_check: number | null;
    task_ids_at_check: string[] | null;
    team_member_ids_checked: string[] | null;
    status: string;
  } | null;
  currentTaskCount: number;
  currentTaskIds: string[];
  taskCreatedTimes: Record<string, string>;
}

function AbsentVerificationsTab() {
  const { user } = useAuth();
  const [audits, setAudits] = useState<SubmissionAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [openingScreenshot, setOpeningScreenshot] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('absent_reason_submissions')
      .select('*, team_member:team_members(*)')
      .order('attendance_date', { ascending: false })
      .order('submission_time', { ascending: false })
      .limit(50);
    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }

    const submissions = (data ?? []) as unknown as AbsentSubmission[];
    if (submissions.length === 0) {
      setAudits([]);
      setLoading(false);
      return;
    }

    const teamMemberIds = submissions
      .map((s) => s.team_member_id)
      .filter((id): id is string => !!id);

    const [attendanceRes, tasksRes] = await Promise.all([
      teamMemberIds.length > 0
        ? supabase
            .from('attendance_records')
            .select('id, team_member_id, attendance_date, status, check_timestamp, task_count_at_check, task_ids_at_check, team_member_ids_checked')
            .in('team_member_id', teamMemberIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      teamMemberIds.length > 0
        ? supabase
            .from('tasks')
            .select('id, team_member_id, due_date, created_at')
            .in('team_member_id', teamMemberIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ]);

    const attendanceRecords = (attendanceRes.data ?? []) as Array<{
      team_member_id: string;
      attendance_date: string;
      status: string;
      check_timestamp: string | null;
      task_count_at_check: number | null;
      task_ids_at_check: string[] | null;
      team_member_ids_checked: string[] | null;
    }>;

    const taskRows = (tasksRes.data ?? []) as Array<{
      id: string;
      team_member_id: string;
      due_date: string;
      created_at: string;
    }>;

    const auditList: SubmissionAudit[] = submissions.map((s) => {
      const matchingAttendance = attendanceRecords.find(
        (a) => a.team_member_id === s.team_member_id && a.attendance_date === s.attendance_date,
      );

      const currentTasks = taskRows.filter(
        (t) => t.team_member_id === s.team_member_id && t.due_date === s.attendance_date,
      );

      const taskCreatedTimes: Record<string, string> = {};
      for (const t of currentTasks) {
        taskCreatedTimes[t.id] = t.created_at;
      }

      return {
        submission: s,
        attendance: matchingAttendance
          ? {
              check_timestamp: matchingAttendance.check_timestamp,
              task_count_at_check: matchingAttendance.task_count_at_check,
              task_ids_at_check: matchingAttendance.task_ids_at_check,
              team_member_ids_checked: matchingAttendance.team_member_ids_checked,
              status: matchingAttendance.status,
            }
          : null,
        currentTaskCount: currentTasks.length,
        currentTaskIds: currentTasks.map((t) => t.id),
        taskCreatedTimes,
      };
    });

    setAudits(auditList);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function verify(submissionId: string) {
    if (!user) return;
    setVerifying(submissionId);
    setError(null);
    const { error: updateError } = await supabase
      .from('absent_reason_submissions')
      .update({
        verified_by: user.id,
        verified_at: new Date().toISOString(),
        verification_note: note[submissionId]?.trim() || null,
      })
      .eq('id', submissionId);
    setVerifying(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setNote((prev) => ({ ...prev, [submissionId]: '' }));
    load();
  }

  async function viewScreenshot(reference: string) {
    const storagePath = getAbsentScreenshotStoragePath(reference);
    if (!storagePath) {
      setError('Could not resolve the stored screenshot path.');
      return;
    }

    const viewer = window.open('about:blank', '_blank');
    if (!viewer) {
      setError('Allow pop-ups to view this screenshot.');
      return;
    }
    viewer.opener = null;
    setOpeningScreenshot(reference);
    setError(null);

    try {
      const { data, error: downloadError } = await supabase
        .storage
        .from('absent-screenshots')
        .download(storagePath);

      if (downloadError || !data) {
        viewer.close();
        setError(downloadError?.message ?? 'Could not download the screenshot.');
        return;
      }

      const objectUrl = URL.createObjectURL(data);
      viewer.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 300000);
    } catch (downloadError) {
      viewer.close();
      setError(downloadError instanceof Error ? downloadError.message : 'Could not download the screenshot.');
    } finally {
      setOpeningScreenshot(null);
    }
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#17243d]">
          <ClipboardCheck className="h-4 w-4 text-[#1478d4]" /> Absent Reason Verifications
        </h2>
        <p className="mt-1 text-xs text-[#5a6c84]">
          Review absent reason submissions with screenshots and arrival times. Verify the proof, then manually change the attendance record from ABSENT to PRESENT or EXCUSED if appropriate. The attendance status is NOT changed automatically.
        </p>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {audits.length === 0 ? (
        <Card className="p-8">
          <EmptyState title="No absent submissions" hint="When employees submit absent reasons, they will appear here for verification." />
        </Card>
      ) : (
        <div className="space-y-4">
          {audits.map(({ submission: s, attendance, currentTaskCount, taskCreatedTimes }) => {
            const memberName = s.team_member?.name ?? 'Unknown';
            const memberEmail = s.team_member?.email ?? 'No email';
            const isVerified = !!s.verified_by;
            const hasScreenshot = !!s.screenshot_url;
            const isCrmDown = s.reason === 'crm_down';

            const checkTs = attendance?.check_timestamp;
            const taskCountAtCheck = attendance?.task_count_at_check ?? 0;
            const tasksExistedBeforeCheck = checkTs
              ? Object.entries(taskCreatedTimes).filter(([, created]) => new Date(created) <= new Date(checkTs)).length
              : 0;
            const tasksCreatedAfterCheck = checkTs
              ? Object.entries(taskCreatedTimes).filter(([, created]) => new Date(created) > new Date(checkTs)).length
              : 0;
            const mismatch = currentTaskCount > 0 && taskCountAtCheck === 0;

            return (
              <Card key={s.id} className="overflow-hidden">
                <div className="border-b border-[#e5ebf3] px-5 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-red-500/10 text-xs font-semibold text-red-600">
                        {memberName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#17243d]">{memberName}</p>
                        <p className="text-xs text-[#5a6c84]">{memberEmail} · {s.attendance_date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isVerified ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
                          <Check className="h-3 w-3" /> Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700">
                          <ClipboardCheck className="h-3 w-3" /> Pending
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-2">
                  <div className="space-y-2 text-sm">
                    <div className="flex gap-2">
                      <span className="w-28 shrink-0 text-xs text-[#5a6c84]">Reason</span>
                      <span className="font-medium text-[#17243d]">{reasonLabel(s.reason)}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-28 shrink-0 text-xs text-[#5a6c84]">Task Count (now)</span>
                      <span className="font-medium text-[#17243d]">{currentTaskCount}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-28 shrink-0 text-xs text-[#5a6c84]">Tasks at check</span>
                      <span className={`font-medium ${mismatch ? 'text-amber-600' : 'text-[#17243d]'}`}>
                        {checkTs ? taskCountAtCheck : '—'}
                      </span>
                    </div>
                    {checkTs && (
                      <div className="flex gap-2">
                        <span className="w-28 shrink-0 text-xs text-[#5a6c84]">Check time</span>
                        <span className="text-[#3d5070]">
                          {new Date(checkTs).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    )}
                    {mismatch && tasksCreatedAfterCheck > 0 && (
                      <div className="mt-1 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
                        {tasksCreatedAfterCheck} task(s) were created AFTER the 10:40 AM check. The ABSENT status is correct — tasks were added late.
                      </div>
                    )}
                    {mismatch && tasksExistedBeforeCheck > 0 && (
                      <div className="mt-1 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-600">
                        {tasksExistedBeforeCheck} task(s) existed BEFORE the check but were not counted. This is a query issue — the attendance may need manual correction.
                      </div>
                    )}
                    {checkTs && currentTaskCount > 0 && !mismatch && (
                      <div className="mt-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700">
                        Tasks were present at check time. Attendance was correctly marked.
                      </div>
                    )}
                    {s.arrival_time && (
                      <div className="flex gap-2">
                        <span className="w-28 shrink-0 text-xs text-[#5a6c84]">Arrival Time</span>
                        <span className="font-medium text-[#17243d]">{s.arrival_time}</span>
                      </div>
                    )}
                    {isCrmDown && s.crm_down_verified && (
                      <div className="flex gap-2">
                        <span className="w-28 shrink-0 text-xs text-[#5a6c84]">CRM Check</span>
                        <span className={`font-medium ${s.crm_down_verified === 'verified' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {crmDownLabel(s.crm_down_verified)}
                        </span>
                      </div>
                    )}
                    {s.explanation && (
                      <div className="flex gap-2">
                        <span className="w-28 shrink-0 text-xs text-[#5a6c84]">Explanation</span>
                        <span className="text-[#3d5070]">{s.explanation}</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <span className="w-28 shrink-0 text-xs text-[#5a6c84]">Submitted</span>
                      <span className="text-[#3d5070]">{new Date(s.submission_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
                    </div>
                    {isVerified && (
                      <>
                        <div className="flex gap-2">
                          <span className="w-28 shrink-0 text-xs text-[#5a6c84]">Verified By</span>
                          <span className="text-[#3d5070]">{s.verified_at ? new Date(s.verified_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'}</span>
                        </div>
                        {s.verification_note && (
                          <div className="flex gap-2">
                            <span className="w-28 shrink-0 text-xs text-[#5a6c84]">Note</span>
                            <span className="text-[#3d5070]">{s.verification_note}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="space-y-3">
                    {hasScreenshot && (
                      <div>
                        <p className="mb-1.5 text-xs font-semibold text-[#5a6c84]">Screenshot / Proof</p>
                        <button
                          type="button"
                          onClick={() => void viewScreenshot(s.screenshot_url!)}
                          disabled={openingScreenshot === s.screenshot_url}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5ebf3] bg-[#fbfcfe] px-3 py-2 text-xs text-[#1478d4] transition-all duration-200 hover:border-cyan-400 hover:bg-cyan-500/5"
                        >
                          <Camera className="h-3.5 w-3.5" />
                          {openingScreenshot === s.screenshot_url ? 'Loading Screenshot...' : 'View Screenshot'}
                        </button>
                      </div>
                    )}

                    {!isVerified && (
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-[#5a6c84]">Verification note (optional)</label>
                        <textarea
                          value={note[s.id] ?? ''}
                          onChange={(e) => setNote((prev) => ({ ...prev, [s.id]: e.target.value }))}
                          rows={2}
                          placeholder="Add a note about this verification..."
                          className="w-full resize-none rounded-lg border border-[#e5ebf3] bg-[#fbfcfe] px-3 py-2 text-sm text-[#17243d] outline-none focus:border-cyan-400"
                        />
                        <div className="mt-2 flex justify-end">
                          <Button
                            size="sm"
                            onClick={() => verify(s.id)}
                            disabled={verifying === s.id}
                          >
                            {verifying === s.id ? 'Verifying...' : 'Mark as Verified'}
                          </Button>
                        </div>
                      </div>
                    )}

                    {isVerified && (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-xs text-emerald-700">
                        This submission has been verified. To change attendance from ABSENT to PRESENT or EXCUSED, use the Attendance page.
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Credentials (Viraj-only) ----------
// NOTE: Attendance Upload tab moved to its own page at /attendance-reports
interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
}

interface CredentialInfo {
  password: string;
  crmLoginId: string;
  setAt: string | null;
}

function CredentialsTab() {
  const { user, session } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ password: string; userEmail: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showTempPassword, setShowTempPassword] = useState(false);
  // Per-user stored credential viewing state
  const [viewing, setViewing] = useState<string | null>(null);
  const [credentialData, setCredentialData] = useState<Record<string, CredentialInfo>>({});
  const [showStoredPassword, setShowStoredPassword] = useState<Record<string, boolean>>({});
  const [copiedStored, setCopiedStored] = useState<string | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

  async function loadUsers() {
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('profiles')
      .select('id, email, display_name, role')
      .order('email');
    if (queryError) {
      setError(queryError.message);
    } else {
      setUsers((data ?? []) as unknown as UserRow[]);
    }
    setLoading(false);
  }

  useEffect(() => { loadUsers(); }, []);

  async function callCredentialApi(action: string, userId: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${supabaseUrl}/functions/v1/admin-reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ action, userId }),
    });
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error((errBody.error as string) ?? `Request failed (${response.status})`);
    }
    return response.json();
  }

  async function viewCredential(userId: string) {
    if (viewing === userId) {
      // Toggle off
      setViewing(null);
      return;
    }
    setViewing(userId);
    setError(null);
    try {
      const result = await callCredentialApi('getCredential', userId);
      if (result.hasCredential) {
        setCredentialData((prev) => ({
          ...prev,
          [userId]: {
            password: result.password as string,
            crmLoginId: result.crmLoginId as string,
            setAt: (result.setAt as string) ?? null,
          },
        }));
        setShowStoredPassword((prev) => ({ ...prev, [userId]: false }));
      } else {
        setCredentialData((prev) => ({ ...prev, [userId]: { password: '', crmLoginId: '', setAt: null } }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve credential');
      setViewing(null);
    }
  }

  async function resetPassword(targetUserId: string, targetEmail: string) {
    if (!confirm(`Reset password for ${targetEmail}? A new temporary password will be generated, stored securely, and shown to you only.`)) return;
    setResetting(targetUserId);
    setError(null);
    setTempPassword(null);
    setCopied(false);
    setShowTempPassword(false);

    try {
      const result = await callCredentialApi('reset', targetUserId);
      if (result.error) {
        setError(result.error as string);
        setResetting(null);
        return;
      }
      setTempPassword({ password: result.temporaryPassword as string, userEmail: result.userEmail as string });
      // Update stored credential data if we had it open
      setCredentialData((prev) => ({
        ...prev,
        [targetUserId]: {
          password: result.temporaryPassword as string,
          crmLoginId: result.userEmail as string,
          setAt: new Date().toISOString(),
        },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error: could not reach the credential service');
    }
    setResetting(null);
  }

  function copyTempPassword() {
    if (!tempPassword) return;
    navigator.clipboard.writeText(tempPassword.password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyStoredPassword(userId: string) {
    const cred = credentialData[userId];
    if (!cred || !cred.password) return;
    navigator.clipboard.writeText(cred.password).then(() => {
      setCopiedStored(userId);
      setTimeout(() => setCopiedStored(null), 2000);
    });
  }

  function formatDate(iso: string | null): string {
    if (!iso) return 'Unknown';
    try {
      return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return 'Unknown';
    }
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#17243d]">
          <KeyRound className="h-4 w-4 text-[#1478d4]" /> User Credential Management
        </h2>
        <p className="mt-1 text-xs text-[#5a6c84]">
          View each user's CRM login ID and password. When you reset a password, the new password is stored securely in an encrypted vault and can be viewed here at any time. Only you can access these credentials.
        </p>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {tempPassword && (
        <Card className="overflow-hidden border-emerald-500/30">
          <div className="border-b border-emerald-500/20 bg-emerald-500/5 px-5 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <Check className="h-4 w-4" /> Password Reset Successful
            </p>
          </div>
          <div className="space-y-3 px-5 py-4">
            <p className="text-xs text-[#5a6c84]">
              Temporary password for <span className="font-medium text-[#17243d]">{tempPassword.userEmail}</span>:
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg border border-[#e5ebf3] bg-[#fbfcfe] px-4 py-3 font-mono text-sm text-[#17243d]">
                {showTempPassword ? tempPassword.password : '••••••••••••••••'}
              </div>
              <button
                onClick={() => setShowTempPassword(!showTempPassword)}
                className="grid h-10 w-10 place-items-center rounded-lg border border-[#e5ebf3] text-[#5a6c84] transition hover:bg-[#eef5fc]"
                title={showTempPassword ? 'Hide' : 'Show'}
              >
                {showTempPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                onClick={copyTempPassword}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  copied
                    ? 'bg-emerald-500/15 text-emerald-700'
                    : 'bg-[#1478d4] text-white hover:bg-[#1267be]'
                }`}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-amber-600">
              This password has been stored in the encrypted vault. You can view it anytime from the user's credential panel below. Share it securely with the user — they should change it after signing in.
            </p>
            <button
              onClick={() => { setTempPassword(null); setCopied(false); setShowTempPassword(false); }}
              className="text-xs font-medium text-[#5a6c84] transition hover:text-[#17243d]"
            >
              Dismiss
            </button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-[#e5ebf3] px-5 py-4">
          <h3 className="text-sm font-semibold text-[#17243d]">CRM Users</h3>
        </div>
        <div className="divide-y divide-[#edf1f6]">
          {users.map((u) => {
            const isSelf = u.id === user?.id;
            const isViewing = viewing === u.id;
            const cred = credentialData[u.id];
            const hasCred = cred && cred.password !== '';
            const showPwd = showStoredPassword[u.id];
            const isCopied = copiedStored === u.id;

            return (
              <div key={u.id} className="px-5 py-3 transition-all duration-200">
                <div className="group flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-cyan-500/10 text-xs font-semibold text-[#3d5070]">
                    {(u.display_name || u.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#17243d]">
                      {u.display_name || u.email}
                      {isSelf && <span className="ml-2 text-xs font-normal text-[#5a6c84]">(you)</span>}
                    </p>
                    <p className="text-xs text-[#5a6c84]">
                      Login ID: <span className="font-mono">{u.email}</span> · Role: <span className="capitalize">{u.role?.replace('_', ' ') ?? 'normal'}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isSelf ? (
                      <span className="text-xs text-[#5a6c84]">Cannot manage own credentials</span>
                    ) : (
                      <>
                        <button
                          onClick={() => viewCredential(u.id)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                            isViewing
                              ? 'border-cyan-500/30 bg-cyan-500/15 text-[#1478d4]'
                              : 'border-[#e5ebf3] text-[#5a6c84] hover:bg-cyan-500/10 hover:text-[#17243d]'
                          }`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {isViewing ? 'Hide' : 'View'}
                        </button>
                        <button
                          onClick={() => resetPassword(u.id, u.email)}
                          disabled={resetting === u.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 transition-all duration-200 hover:bg-amber-500/20 disabled:opacity-50"
                        >
                          {resetting === u.id ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-700" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          {resetting === u.id ? 'Resetting...' : 'Reset Password'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Credential detail panel */}
                {isViewing && cred && (
                  <div className="mt-3 space-y-2 rounded-lg border border-[#e5ebf3] bg-[#fbfcfe] p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#5a6c84]">CRM Login ID</span>
                      <span className="font-mono text-sm text-[#17243d]">{cred.crmLoginId || u.email}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-[#5a6c84]">CRM Password</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-[#17243d]">
                          {hasCred ? (showPwd ? cred.password : '••••••••••••') : 'Not set — use Reset Password to generate one'}
                        </span>
                        {hasCred && (
                          <>
                            <button
                              onClick={() => setShowStoredPassword((prev) => ({ ...prev, [u.id]: !prev[u.id] }))}
                              className="grid h-7 w-7 place-items-center rounded-md border border-[#e5ebf3] text-[#5a6c84] transition hover:bg-[#eef5fc]"
                              title={showPwd ? 'Hide' : 'Show'}
                            >
                              {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              onClick={() => copyStoredPassword(u.id)}
                              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all ${
                                isCopied
                                  ? 'bg-emerald-500/15 text-emerald-700'
                                  : 'bg-[#1478d4] text-white hover:bg-[#1267be]'
                              }`}
                            >
                              {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                              {isCopied ? 'Copied' : 'Copy'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {hasCred && cred.setAt && (
                      <div className="flex items-center justify-between border-t border-[#edf1f6] pt-2">
                        <span className="text-xs font-semibold text-[#5a6c84]">Last Set</span>
                        <span className="text-xs text-[#5a6c84]">{formatDate(cred.setAt)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {users.length === 0 && <EmptyState title="No users found" />}
        </div>
      </Card>
    </div>
  );
}
