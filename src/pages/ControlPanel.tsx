import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, PageLoader } from '@/components/ui';
import type { Profile } from '@/lib/types';
import { SlidersHorizontal, ShieldCheck, Database, KeyRound, Trash2, FileWarning, AlertTriangle, Users, X } from 'lucide-react';

const PRIMARY_MASTER_EMAIL = 'viraj.digitalsky360@gmail.com';

export default function ControlPanel() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleteType, setDeleteType] = useState<'full' | 'data_only'>('full');
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  async function load() {
    const { data: pData } = await supabase.from('profiles').select('*, team_member:team_members(*)').order('display_name', { ascending: true });
    if (pData) {
      const sorted = [...(pData as unknown as Profile[])].sort((a, b) => {
        if (a.email?.toLowerCase() === PRIMARY_MASTER_EMAIL) return -1;
        if (b.email?.toLowerCase() === PRIMARY_MASTER_EMAIL) return 1;
        const roleOrder: Record<string, number> = { master: 0, task_manager: 1, view_all: 2, normal: 3 };
        return (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3);
      });
      setProfiles(sorted);
    }
    // table counts
    const tables = ['tasks','clients','team_members','workspaces','task_notes','sticky_notes','settings','permissions'];
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
      counts[t] = count ?? 0;
    }
    setStats(counts);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function setRole(profileId: string, role: string) {
    setSavingId(profileId);
    const { error } = await supabase.rpc('set_user_role', { p_user_id: profileId, p_role: role });
    setSavingId(null);
    if (error) { alert('Could not change role: ' + error.message); return; }
    load();
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-[#17243d]">
          <SlidersHorizontal className="h-5 w-5 text-[#1478d4]" /> Control Panel
        </h1>
        <p className="text-sm text-[#5a6c84]">System administration — protected at the database level</p>
      </div>

      {/* user role control */}
      <Card className="overflow-hidden">
        <div className="border-b border-[#e5ebf3] px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#17243d]">
            <KeyRound className="h-4 w-4 text-sky-600" /> User Role Control
          </h2>
          <p className="text-xs text-[#5a6c84]">Role changes are enforced by a SECURITY DEFINER function — only masters can call it.</p>
        </div>
        <div className="divide-y divide-[#edf1f6]">
          {profiles.map((p) => {
            const isPrimaryMaster = p.email?.toLowerCase() === PRIMARY_MASTER_EMAIL;
            return (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-cyan-500/10 text-xs font-semibold text-[#5a6c84]">
                {(p.display_name || p.email || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-[160px] flex-1">
                <p className="text-sm font-medium text-[#17243d]">
                  {p.display_name || p.email}
                  {isPrimaryMaster && <span className="ml-2 text-[10px] uppercase tracking-wide text-[#1478d4]">Primary Master</span>}
                </p>
                <p className="text-xs text-[#5a6c84]">{p.email}</p>
              </div>
              {isPrimaryMaster ? (
                <span className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-medium text-cyan-700">
                  Primary Master — Locked
                </span>
              ) : (
                <select
                  value={p.role}
                  disabled={savingId === p.id}
                  onChange={(e) => setRole(p.id, e.target.value)}
                  className="rounded-lg border border-[#dbe5f0] bg-[#fbfcfe] px-2.5 py-1.5 text-xs text-[#17243d] outline-none focus:border-cyan-400 [&>option]:bg-white"
                >
                  <option value="normal">Normal</option>
                  <option value="view_all">View All</option>
                  <option value="task_manager">Task Manager</option>
                  <option value="master">Master</option>
                </select>
              )}
            </div>
            );
          })}
          {profiles.length === 0 && <p className="px-5 py-6 text-center text-sm text-[#5a6c84]">No users have signed up yet.</p>}
        </div>
      </Card>

      {/* User & Data Management */}
      <Card className="overflow-hidden">
        <div className="border-b border-[#e5ebf3] px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#17243d]">
            <Users className="h-4 w-4 text-rose-600" /> User & Data Management
          </h2>
          <p className="text-xs text-[#5a6c84]">Permanently delete users and their CRM data. Only the Primary Master can perform deletions.</p>
        </div>
        <div className="divide-y divide-[#edf1f6]">
          {profiles.length === 0 && (
            <p className="px-5 py-6 text-center text-sm text-[#5a6c84]">No users found.</p>
          )}
          {profiles.map((p) => {
            const isPrimaryMaster = p.email?.toLowerCase() === PRIMARY_MASTER_EMAIL;
            const isSelf = p.id === (profiles.find(x => x.email?.toLowerCase() === PRIMARY_MASTER_EMAIL)?.id);
            const roleLabel =
              isPrimaryMaster ? 'Primary Master'
              : p.role === 'master' ? 'Master'
              : p.role === 'task_manager' ? 'Task Manager'
              : p.role === 'view_all' ? 'View All'
              : 'Team Member';
            const teamName = (p as any).team_member?.name ?? '—';
            const createdDate = p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

            return (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-cyan-500/10 text-xs font-semibold text-[#5a6c84]">
                  {(p.display_name || p.email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-[180px] flex-1">
                  <p className="text-sm font-medium text-[#17243d]">
                    {p.display_name || p.email}
                    {isPrimaryMaster && <span className="ml-2 text-[10px] uppercase tracking-wide text-[#1478d4]">Primary Master</span>}
                  </p>
                  <p className="text-xs text-[#5a6c84]">{p.email}</p>
                </div>
                <div className="hidden text-xs text-[#5a6c84] sm:block">
                  <p className="text-[#5a6c84]">Role</p>
                  <p className="font-medium text-[#5a6c84]">{roleLabel}</p>
                </div>
                <div className="hidden text-xs text-[#5a6c84] md:block">
                  <p className="text-[#5a6c84]">Team</p>
                  <p className="font-medium text-[#5a6c84]">{teamName}</p>
                </div>
                <div className="hidden text-xs text-[#5a6c84] md:block">
                  <p className="text-[#5a6c84]">Created</p>
                  <p className="font-medium text-[#5a6c84]">{createdDate}</p>
                </div>
                {isPrimaryMaster ? (
                  <span className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-medium text-cyan-700">
                    Protected
                  </span>
                ) : (
                  <button
                    onClick={() => { setDeleteTarget(p); setDeleteError(null); setDeleteSuccess(null); }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-700 transition-all hover:bg-rose-500/20 hover:text-rose-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {deleteSuccess && (
          <div className="px-5 py-3 text-xs text-emerald-600">{deleteSuccess}</div>
        )}
      </Card>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !deleteSaving && setDeleteTarget(null)}>
          <div className="w-full max-w-md rounded-2xl border border-[#e5ebf3] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
                <h3 className="text-base font-semibold text-[#17243d]">Confirm Deletion</h3>
              </div>
              <button onClick={() => !deleteSaving && setDeleteTarget(null)} className="text-[#5a6c84] hover:text-[#5a6c84]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-rose-500/10 text-sm font-semibold text-rose-700">
                  {(deleteTarget.display_name || deleteTarget.email || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#17243d]">{deleteTarget.display_name || deleteTarget.email}</p>
                  <p className="text-xs text-[#5a6c84]">{deleteTarget.email}</p>
                </div>
              </div>
            </div>

            <p className="mb-4 text-sm text-[#5a6c84]">
              This will permanently delete this user and all associated CRM data. This action cannot be undone.
            </p>

            {/* Deletion type selector */}
            <div className="mb-4 space-y-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#e5ebf3] bg-[#fbfcfe] p-3 transition-all hover:border-cyan-500/40">
                <input
                  type="radio"
                  name="deleteType"
                  checked={deleteType === 'full'}
                  onChange={() => setDeleteType('full')}
                  disabled={deleteSaving}
                  className="mt-0.5 accent-rose-500"
                />
                <div>
                  <p className="text-sm font-medium text-[#17243d]">Delete User + All Data</p>
                  <p className="text-xs text-[#5a6c84]">Removes the login account, profile, tasks, leaves, attendance, and all CRM data. The user can no longer log in.</p>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#e5ebf3] bg-[#fbfcfe] p-3 transition-all hover:border-cyan-500/40">
                <input
                  type="radio"
                  name="deleteType"
                  checked={deleteType === 'data_only'}
                  onChange={() => setDeleteType('data_only')}
                  disabled={deleteSaving}
                  className="mt-0.5 accent-amber-500"
                />
                <div>
                  <p className="text-sm font-medium text-[#17243d]">Delete Data Only</p>
                  <p className="text-xs text-[#5a6c84]">Removes the user's CRM data (tasks, leaves, attendance, etc.) but keeps their login account and profile.</p>
                </div>
              </label>
            </div>

            {deleteError && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-700">
                <FileWarning className="h-4 w-4 shrink-0" /> {deleteError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
                disabled={deleteSaving}
                className="flex-1 rounded-lg border border-[#e5ebf3] bg-[#fbfcfe] px-4 py-2.5 text-sm font-medium text-[#5a6c84] transition-all hover:bg-[#f3f7fc] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setDeleteSaving(true);
                  setDeleteError(null);
                  setDeleteSuccess(null);
                  const { data, error } = await supabase.rpc('delete_user_account', {
                    p_target_user_id: deleteTarget.id,
                    p_deletion_type: deleteType,
                  });
                  setDeleteSaving(false);
                  if (error) {
                    setDeleteError(error.message);
                    return;
                  }
                  if (data && data.success === false) {
                    setDeleteError(data.error || 'Deletion failed.');
                    return;
                  }
                  setDeleteSuccess(
                    deleteType === 'full'
                      ? `Successfully deleted ${deleteTarget.display_name || deleteTarget.email} and all associated data.`
                      : `Successfully deleted CRM data for ${deleteTarget.display_name || deleteTarget.email}. Login account preserved.`
                  );
                  setDeleteTarget(null);
                  load();
                }}
                disabled={deleteSaving}
                className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all disabled:opacity-50 ${
                  deleteType === 'full'
                    ? 'bg-rose-500/80 text-[#17243d] hover:bg-rose-500'
                    : 'bg-amber-500/80 text-[#17243d] hover:bg-amber-500'
                }`}
              >
                {deleteSaving ? 'Deleting...' : deleteType === 'full' ? 'Delete Permanently' : 'Delete Data Only'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* database stats */}
      <Card className="p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#17243d]">
          <Database className="h-4 w-4 text-[#1478d4]" /> Database Status
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(stats).map(([k, v]) => (
            <div key={k} className="rounded-xl border border-[#e5ebf3] bg-cyan-500/[0.03] p-3">
              <p className="text-xs text-[#5a6c84]">{k}</p>
              <p className="text-xl font-semibold text-[#17243d]">{v}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-700">
          <ShieldCheck className="h-4 w-4" /> Row Level Security enabled on all tables
        </div>
      </Card>
    </div>
  );
}
