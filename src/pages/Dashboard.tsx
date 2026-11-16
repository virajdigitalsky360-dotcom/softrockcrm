import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useTasks, useClients, useTeamMembers, useWorkspaces, useLeaves } from '@/lib/hooks';
import type { Task } from '@/lib/types';
import { Card, StatusBadge, PageLoader, EmptyState, Button, Select, Input } from '@/components/ui';
import StatusSelect from '@/components/StatusSelect';
import TaskModal from '@/components/TaskModal';
import StickyNoteWidget from '@/components/StickyNoteWidget';
import DashboardAttendance from '@/components/DashboardAttendance';
import ScreenShareWidget from '@/components/ScreenShareWidget';
import { useTestNotification } from '@/lib/useTestNotification';
import { Plus, Filter, ListTodo, Clock, CircleDot, CheckCircle2, Users as UsersIcon, CalendarDays, Pencil, Mail, CheckCircle, XCircle, CalendarClock, CalendarCheck, Bell, ChevronDown, CheckSquare2 } from 'lucide-react';

function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isToday(dateStr: string | null) {
  if (!dateStr) return false;
  return dateStr === istToday();
}

function dueLabel(dateStr: string | null) {
  if (!dateStr) return 'No due date';
  if (isToday(dateStr)) return 'Today';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Dashboard() {
  const { isViewOnly, isMaster, session, profile } = useAuth();

  const [greeting, setGreeting] = useState('');
  useEffect(() => {
    const compute = () => {
      const now = new Date();
      const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const h = ist.getHours();
      if (h >= 5 && h < 12) setGreeting('Good Morning');
      else if (h >= 12 && h < 17) setGreeting('Good Afternoon');
      else if (h >= 17 && h < 21) setGreeting('Good Evening');
      else setGreeting('Good Night');
    };
    compute();
    const t = setInterval(compute, 60_000);
    return () => clearInterval(t);
  }, []);

  const userDisplayName = profile?.display_name || profile?.email?.split('@')[0] || 'there';
  const { workspaces } = useWorkspaces();
  const { members } = useTeamMembers();
  const { clients } = useClients();
  const { leaves } = useLeaves();

  // filters
  const [fPerson, setFPerson] = useState('');
  const [fWorkspace, setFWorkspace] = useState('');
  const [fClient, setFClient] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fDate, setFDate] = useState(() => istToday());

  const { tasks, loading, reload } = useTasks({
    teamMemberId: fPerson || null,
    workspaceId: fWorkspace || null,
    clientId: fClient || null,
    status: fStatus || null,
    dueDate: fDate || null,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);

  const stats = useMemo(() => {
    const total = tasks.length;
    const notStarted = tasks.filter((t) => t.status === 'not_started').length;
    const started = tasks.filter((t) => t.status === 'started').length;
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
    const approved = tasks.filter((t) => t.status === 'approved').length;
    const inApproval = tasks.filter((t) => t.status === 'in_approval').length;
    const notApproved = tasks.filter((t) => t.status === 'not_approved').length;
    return { total, notStarted, started, inProgress, inApproval, approved, notApproved, clients: clients.length };
  }, [tasks, clients]);

  function openNew() { setEditTask(null); setModalOpen(true); }
  function openEdit(t: Task) { setEditTask(t); setModalOpen(true); }

  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  async function sendPendingEmail() {
    setEmailSending(true);
    setEmailResult(null);
    try {
      const token = session?.access_token;
      if (!token) {
        setEmailResult({ type: 'error', message: 'You must be signed in to send emails.' });
        setEmailSending(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke('irfan-pending-task-alert', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) {
        setEmailResult({ type: 'error', message: `Failed to send email: ${error.message}` });
      } else if (data?.sent) {
        setEmailResult({ type: 'success', message: 'Pending task email sent successfully.' });
      } else if (data?.reason === 'no_pending_tasks') {
        setEmailResult({ type: 'info', message: 'No pending tasks found.' });
      } else {
        setEmailResult({ type: 'error', message: data?.error ?? 'Unexpected response from server.' });
      }
    } catch {
      setEmailResult({ type: 'error', message: 'An unexpected error occurred while sending the email.' });
    }
    setEmailSending(false);
  }

  const { isViraj, sending: notifSending, status: notifStatus, triggerTest } = useTestNotification();
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testOwner, setTestOwner] = useState('');

  if (loading) return <PageLoader />;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* greeting */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#17243d]">Dashboard</h1>
          <p className="mt-1 text-sm text-[#5a6c84]">Here's what's happening with your tasks today.</p>
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-[#e1e8f1] bg-white px-3 py-2.5 text-sm font-medium text-[#405572] shadow-sm">
          <CalendarDays className="h-4 w-4 text-[#4a5b73]" />
          <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className="bg-transparent outline-none" />
          <ChevronDown className="h-4 w-4 text-[#5a6c84]" />
        </label>
      </div>

      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {isMaster && (
            <Button
              onClick={sendPendingEmail}
              disabled={emailSending}
              variant="subtle"
            >
              {emailSending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Mail className="h-4 w-4" />}
              Send Pending Email Now
            </Button>
          )}
          {isViraj && (
            <Button onClick={() => setTestModalOpen(true)} disabled={notifSending} variant="subtle">
              {notifSending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Bell className="h-4 w-4" />}
              Test Desktop Notification
            </Button>
          )}
          {!isViewOnly && (
            <Button onClick={openNew}><Plus className="h-4 w-4" /> Add Task</Button>
          )}
        </div>
      </div>

      {notifStatus && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
          <Bell className="h-4 w-4 shrink-0" />
          <span>{notifStatus}</span>
          <button onClick={() => { setTestModalOpen(false); }} className="ml-auto text-sky-600 hover:text-sky-800">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {isViraj && testModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#17243d]">Test Desktop Notification</h3>
              <button onClick={() => setTestModalOpen(false)} className="text-[#5a6c84] hover:text-[#17243d]">
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-[#5a6c84]">Simulates an inactive task and sends notifications to the task owner, Kapil, and Rostan. No real task is created or modified. No email is sent.</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#3d5070]">Select a today's task to simulate</label>
                <Select value={testOwner} onChange={(e) => {
                  setTestOwner(e.target.value);
                }}>
                  <option value="">Choose a task...</option>
                  {tasks.filter((t) => {
                    const s = t.status as string;
                    return s === 'not_started' || s === 'started' || s === 'in_progress' || s === 'changes_required' || s === 'not_approved';
                  }).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} — {t.team_member?.name ?? 'Unassigned'}
                    </option>
                  ))}
                </Select>
              </div>
              {tasks.filter((t) => {
                const s = t.status as string;
                return s === 'not_started' || s === 'started' || s === 'in_progress' || s === 'changes_required' || s === 'not_approved';
              }).length === 0 && (
                <p className="text-xs text-amber-600">No active today's tasks found. Create a task first or adjust filters to show today's tasks.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="subtle" onClick={() => setTestModalOpen(false)}>Cancel</Button>
              <Button
                onClick={async () => {
                  const t = tasks.find((t) => t.id === testOwner);
                  if (!t) return;
                  const ownerEmail = t.team_member?.email ?? '';
                  const ownerName = t.team_member?.name ?? 'Unassigned';
                  await triggerTest(t.name, ownerEmail, ownerName);
                  setTestModalOpen(false);
                }}
                disabled={!testOwner || notifSending}
              >
                {notifSending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Bell className="h-4 w-4" />}
                Send Test
              </Button>
            </div>
          </Card>
        </div>
      )}

      {emailResult && (
        <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
          emailResult.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
          emailResult.type === 'info' ? 'border-sky-200 bg-sky-50 text-sky-700' :
          'border-rose-200 bg-rose-50 text-rose-700'
        }`}>
          {emailResult.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> :
           emailResult.type === 'info' ? <CheckCircle className="h-4 w-4 shrink-0" /> :
           <XCircle className="h-4 w-4 shrink-0" />}
          <span>{emailResult.message}</span>
          <button onClick={() => setEmailResult(null)} className="ml-auto text-[#5a6c84] hover:text-[#17243d]">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<CheckSquare2 className="h-5 w-5" />} label="Total Tasks" value={stats.total} accent="bg-[#eff7ff]" iconStyle="bg-[#dcecff] text-[#1478d4]" />
        <StatCard icon={<Clock className="h-5 w-5" />} label="Pending" value={stats.notStarted + stats.started + stats.inApproval} accent="bg-[#fff9e9]" iconStyle="bg-[#ffedbf] text-[#d69200]" />
        <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Approved" value={stats.approved} accent="bg-[#effbf3]" iconStyle="bg-[#d4f4df] text-[#20a35b]" />
        <StatCard icon={<XCircle className="h-5 w-5" />} label="Not Approved" value={stats.notApproved} accent="bg-[#fff1f3]" iconStyle="bg-[#ffd9df] text-[#ed4b68]" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* today's tasks */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-5 pb-3 pt-5">
              <h2 className="text-lg font-bold text-[#17243d]">Recent Tasks</h2>
              <button className="text-sm font-semibold text-[#1478d4] transition hover:text-[#0f5ca8]">View All <span aria-hidden="true">›</span></button>
            </div>

            {/* filters */}
            <div className="flex flex-wrap items-end gap-2 border-b border-[#edf1f6] px-5 py-3">
              <Filter className="h-4 w-4 text-[#3d5070] self-center" />
              <div className="min-w-[120px] flex-1">
                <Select value={fPerson} onChange={(e) => setFPerson(e.target.value)}>
                  <option value="">All People</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </div>
              <div className="min-w-[120px] flex-1">
                <Select value={fWorkspace} onChange={(e) => setFWorkspace(e.target.value)}>
                  <option value="">All Workspaces</option>
                  {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </div>
              <div className="min-w-[120px] flex-1">
                <Select value={fClient} onChange={(e) => setFClient(e.target.value)}>
                  <option value="">All Clients</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div className="min-w-[120px] flex-1">
                <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                  <option value="">All Statuses</option>
                  <option value="not_started">Not Started</option>
                  <option value="started">Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="in_approval">In Approval</option>
                  <option value="approved">Approved</option>
                  <option value="not_approved">Not Approved</option>
                </Select>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="min-w-[140px] flex-1">
                  <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
                </div>
                {fDate !== istToday() && (
                  <button
                    onClick={() => setFDate(istToday())}
                    className="shrink-0 rounded-lg border border-[#1478d4]/30 bg-[#eef5fc] px-2.5 py-2 text-xs font-medium text-[#1478d4] transition-all duration-200 hover:bg-[#e0edfb] hover:scale-105 active:scale-95"
                    title="Jump to today"
                  >
                    Today
                  </button>
                )}
              </div>
            </div>

            {/* list */}
            {tasks.length === 0 ? (
              <EmptyState title="No tasks found" hint="Try adjusting filters or add a new task." />
            ) : (
              <div className="divide-y divide-[#edf1f6]">
                {tasks.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-4 transition-all duration-200 hover:bg-[#f8fbff]">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#edf5ff] text-xs font-semibold text-[#1478d4]">
                      {(t.team_member?.name ?? '?').charAt(0)}
                    </div>
                    <div className="min-w-[140px] flex-1">
                      <p className="text-sm font-semibold text-[#263754]">{t.name}</p>
                      <p className="text-xs text-[#5a6c84]">
                        {t.team_member?.name ?? 'Unassigned'} · {t.client?.name ?? 'No client'} · {t.workspace?.name ?? '—'}
                      </p>
                    </div>
                    <div className="hidden sm:block">
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="hidden md:block text-xs font-medium text-[#4a5b73]">{dueLabel(t.due_date)}</div>
                    <div className="flex items-center gap-2">
                      {!isViewOnly && (
                        <StatusSelect task={t} onChanged={() => {/* realtime will refresh */}} />
                      )}
                      {isViewOnly && <StatusBadge status={t.status} />}
                      {!isViewOnly && (
                        <button onClick={() => openEdit(t)} className="grid h-8 w-8 place-items-center rounded-lg text-[#5a6c84] transition-all duration-200 hover:bg-[#eef5fc] hover:text-[#1478d4] hover:scale-110 active:scale-95">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* sticky note */}
        <div className="space-y-6">
          <DashboardAttendance />
          {!isMaster && <ScreenShareWidget />}
          <StickyNoteWidget />
        </div>
      </div>

      {/* leave summary */}
      {leaves.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#edf1f6] px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[#17243d]">
                <CalendarCheck className="h-4 w-4 text-[#1478d4]" /> Upcoming Approved Leaves
              </h2>
            </div>
            {leaves.filter((l) => l.status === 'approved' && new Date(l.to_date) >= new Date(new Date().toISOString().slice(0, 10))).length === 0 ? (
              <div className="px-5 py-6 text-center text-xs text-[#5a6c84]">No upcoming approved leaves</div>
            ) : (
              <div className="divide-y divide-[#edf1f6]">
                {leaves
                  .filter((l) => l.status === 'approved' && new Date(l.to_date) >= new Date(new Date().toISOString().slice(0, 10)))
                  .map((l) => (
                    <div key={l.id} className="flex items-center gap-3 px-5 py-3 transition-all duration-200 hover:bg-[#f8fbff]">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e8f1fb] text-xs font-semibold text-[#1478d4]">
                        {l.employee_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#263754]">{l.employee_name}</p>
                        <p className="flex items-center gap-1 text-xs text-[#5a6c84]">
                          <CalendarDays className="h-3 w-3" />
                          {new Date(l.from_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — {new Date(l.to_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          <span className="ml-1 rounded bg-[#e8f1fb] px-1.5 py-0.5 text-[10px] uppercase text-[#1478d4]">{l.day_type === 'half' ? 'Half' : 'Full'}</span>
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </Card>
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#edf1f6] px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[#17243d]">
                <CalendarClock className="h-4 w-4 text-amber-500" /> Pending Leave Requests
              </h2>
            </div>
            {leaves.filter((l) => l.status === 'pending').length === 0 ? (
              <div className="px-5 py-6 text-center text-xs text-[#5a6c84]">No pending leave requests</div>
            ) : (
              <div className="divide-y divide-[#edf1f6]">
                {leaves.filter((l) => l.status === 'pending').map((l) => (
                  <div key={l.id} className="flex items-center gap-3 px-5 py-3 transition-all duration-200 hover:bg-cyan-500/[0.04]">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-semibold text-amber-700">
                      {l.employee_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#17243d]">{l.employee_name}</p>
                      <p className="flex items-center gap-1 text-xs text-[#3d5070]">
                        <CalendarDays className="h-3 w-3" />
                        {new Date(l.from_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — {new Date(l.to_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">Pending</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={editTask}
        clients={clients}
        members={members}
        workspaces={workspaces}
        onSaved={reload}
      />
    </div>
  );
}

function StatCard({ icon, label, value, accent, iconStyle }: { icon: React.ReactNode; label: string; value: number; accent: string; iconStyle: string }) {
  return (
    <Card className={`flex items-center gap-4 border-transparent p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${accent}`}>
      <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${iconStyle}`}>{icon}</div>
      <div>
        <p className="text-sm font-medium text-[#4a5b73]">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-[#17243d]">{value}</p>
      </div>
    </Card>
  );
}
