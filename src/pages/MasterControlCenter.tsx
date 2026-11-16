import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Card, PageLoader, EmptyState, Button, StatusBadge, Modal, Select, Input } from '@/components/ui';
import type { TeamMember, Task, AttendanceRecord, Leave, TaskHistory, AbsentSubmission, Profile } from '@/lib/types';
import AnomalyDetection from '@/components/AnomalyDetection';
import {
  Activity, AlertTriangle, Users, CheckCircle2, XCircle, Clock,
  FileText, CalendarDays, ChevronRight, Search, RefreshCw, Eye,
  Ban, CheckCircle, Bell, History, ShieldAlert,
} from 'lucide-react';

const PRIMARY_MASTER_EMAIL = 'viraj.digitalsky360@gmail.com';
const MASTER_EMAILS = new Set(['viraj.digitalsky360@gmail.com', 'kapilprajapati9054@gmail.com', 'softrockind@gmail.com']);

function indiaDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function formatDateTime(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(ts: string | null): string {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  const mins = Math.floor(diff / 60000);
  if (mins > 0) return `${mins}m ago`;
  return 'just now';
}

function hoursSince(ts: string | null): number {
  if (!ts) return Infinity;
  return (Date.now() - new Date(ts).getTime()) / 3600000;
}

interface EmployeeRow {
  member: TeamMember;
  profile: Profile | null;
  todayTasks: Task[];
  pendingCount: number;
  inProgressCount: number;
  inApprovalCount: number;
  approvedCount: number;
  changesRequiredCount: number;
  lastActivity: string | null;
  attendance: AttendanceRecord | null;
  absentSubmission: AbsentSubmission | null;
  crmDown?: boolean;
}

interface AlertItem {
  level: 'warning' | 'error';
  title: string;
  detail: string;
  employee?: string;
}

export default function MasterControlCenter() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [emailFailures, setEmailFailures] = useState<number>(0);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [empFilter, setEmpFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState(indiaDate());
  const [statusFilter, setStatusFilter] = useState('all');
  const [attendanceFilter, setAttendanceFilter] = useState('all');

  // Detail modal
  const [selectedEmp, setSelectedEmp] = useState<EmployeeRow | null>(null);
  const [empDetail, setEmpDetail] = useState<EmployeeDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Task history modal
  const [taskHistory, setTaskHistory] = useState<TaskHistory[]>([]);
  const [historyTaskName, setHistoryTaskName] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);

  // Admin note modal
  const [noteTarget, setNoteTarget] = useState<EmployeeRow | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  const today = indiaDate();

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [membersRes, profilesRes, tasksRes, attendanceRes, submissionsRes, emailLogsRes] = await Promise.all([
        supabase.from('team_members').select('*, workspace:workspaces(*)').order('name'),
        supabase.from('profiles').select('*, team_member:team_members(*)'),
        supabase.from('tasks').select('*, client:clients(*), team_member:team_members(*, workspace:workspaces(*)), workspace:workspaces(*)').order('updated_at', { ascending: false }),
        supabase.from('attendance_records').select('*, team_member:team_members(*)').eq('attendance_date', today),
        supabase.from('absent_reason_submissions').select('*, team_member:team_members(*)').eq('attendance_date', today),
        supabase.from('centralized_email_logs').select('status, created_at').order('created_at', { ascending: false }).limit(50),
      ]);

      const members = (membersRes.data ?? []) as TeamMember[];
      const profiles = (profilesRes.data ?? []) as Profile[];
      const tasks = (tasksRes.data ?? []) as Task[];
      const attendanceRecords = (attendanceRes.data ?? []) as AttendanceRecord[];
      const submissions = (submissionsRes.data ?? []) as AbsentSubmission[];
      const emailLogs = (emailLogsRes.data ?? []) as Array<{ status: string; created_at: string }>;

      setAllTasks(tasks);
      setEmailFailures(emailLogs.filter((l) => l.status === 'failed').length);

      const profileByMemberEmail = new Map<string, Profile>();
      const profileByUserId = new Map<string, Profile>();
      for (const p of profiles) {
        if (p.email) profileByMemberEmail.set(p.email.toLowerCase(), p);
        profileByUserId.set(p.id, p);
      }

      const attendanceByMember = new Map<string, AttendanceRecord>();
      for (const a of attendanceRecords) attendanceByMember.set(a.team_member_id, a);

      const submissionByMember = new Map<string, AbsentSubmission>();
      for (const s of submissions) if (s.team_member_id) submissionByMember.set(s.team_member_id, s);

      const empRows: EmployeeRow[] = members.map((member) => {
        const profile = member.email ? profileByMemberEmail.get(member.email.toLowerCase()) ?? null : null;
        const memberTasks = tasks.filter((t) => t.team_member_id === member.id);
        const todayTasks = memberTasks.filter((t) => t.due_date === today);
        const pendingCount = memberTasks.filter((t) => ['not_started', 'started', 'in_progress', 'in_approval'].includes(t.status)).length;
        const inProgressCount = memberTasks.filter((t) => t.status === 'in_progress').length;
        const inApprovalCount = memberTasks.filter((t) => t.status === 'in_approval').length;
        const approvedCount = memberTasks.filter((t) => t.status === 'approved').length;
        const changesRequiredCount = memberTasks.filter((t) => t.status === 'not_approved').length;
        const lastActivity = memberTasks.length > 0 ? memberTasks[0].updated_at : null;
        const attendance = attendanceByMember.get(member.id) ?? null;
        const absentSubmission = submissionByMember.get(member.id) ?? null;

        return {
          member, profile, todayTasks, pendingCount, inProgressCount, inApprovalCount,
          approvedCount, changesRequiredCount, lastActivity, attendance, absentSubmission,
        };
      });

      setEmployees(empRows);
    } catch (err) {
      console.error('Control center load error', err);
    }
    setLoading(false);
    setRefreshing(false);
  }, [today]);

  useEffect(() => { load(); }, [load]);

  // Generate alerts
  const alerts = useMemo<AlertItem[]>(() => {
    const items: AlertItem[] = [];
    for (const emp of employees) {
      if (MASTER_EMAILS.has(emp.member.email?.toLowerCase() ?? '')) continue;
      if (emp.todayTasks.length === 0) {
        items.push({ level: 'warning', title: 'No task today', detail: `${emp.member.name} has no task assigned for today.`, employee: emp.member.name });
      }
      if (emp.attendance?.status === 'absent') {
        items.push({ level: 'warning', title: 'Absent today', detail: `${emp.member.name} is marked absent. Reason: ${emp.absentSubmission ? emp.absentSubmission.reason.replace(/_/g, ' ') : 'not submitted'}.`, employee: emp.member.name });
      }
      if (emp.changesRequiredCount > 0) {
        items.push({ level: 'warning', title: 'Changes required', detail: `${emp.member.name} has ${emp.changesRequiredCount} task(s) with "Not Approved" status.`, employee: emp.member.name });
      }
      for (const t of emp.todayTasks) {
        const stale = hoursSince(t.updated_at);
        if (stale >= 3 && ['not_started', 'started', 'in_progress'].includes(t.status)) {
          items.push({ level: 'warning', title: 'Task inactive 3+ hours', detail: `"${t.name}" for ${emp.member.name} — last updated ${timeAgo(t.updated_at)}.`, employee: emp.member.name });
        }
      }
    }
    // Overdue pending tasks
    const overdueTasks = allTasks.filter((t) => t.due_date && t.due_date < today && ['not_started', 'started', 'in_progress', 'in_approval'].includes(t.status));
    if (overdueTasks.length > 0) {
      items.push({ level: 'warning', title: `${overdueTasks.length} overdue pending task(s)`, detail: overdueTasks.slice(0, 5).map((t) => `"${t.name}" — ${t.team_member?.name ?? 'Unassigned'} — due ${t.due_date}`).join('\n') });
    }
    // Email failures
    if (emailFailures > 0) {
      items.push({ level: 'error', title: `${emailFailures} recent email failure(s)`, detail: 'Check Email Notifications in Master Panel for details.' });
    }
    return items;
  }, [employees, allTasks, today, emailFailures]);

  // Summary stats
  const stats = useMemo(() => {
    const activeEmps = employees.filter((e) => !MASTER_EMAILS.has(e.member.email?.toLowerCase() ?? ''));
    const present = activeEmps.filter((e) => e.attendance && ['present', 'on_time'].includes(e.attendance.status)).length;
    const absent = activeEmps.filter((e) => e.attendance?.status === 'absent').length;
    const excused = activeEmps.filter((e) => e.attendance?.status === 'excused').length;
    const noTask = activeEmps.filter((e) => e.todayTasks.length === 0).length;
    const totalPending = activeEmps.reduce((s, e) => s + e.pendingCount, 0);
    const totalInProgress = activeEmps.reduce((s, e) => s + e.inProgressCount, 0);
    const totalInApproval = activeEmps.reduce((s, e) => s + e.inApprovalCount, 0);
    const totalApproved = activeEmps.reduce((s, e) => s + e.approvedCount, 0);
    const totalChangesReq = activeEmps.reduce((s, e) => s + e.changesRequiredCount, 0);
    return { present, absent, excused, noTask, totalPending, totalInProgress, totalInApproval, totalApproved, totalChangesReq, activeCount: activeEmps.length };
  }, [employees]);

  // Apply filters
  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      if (MASTER_EMAILS.has(e.member.email?.toLowerCase() ?? '')) return false;
      if (empFilter !== 'all' && e.member.id !== empFilter) return false;
      if (attendanceFilter !== 'all') {
        const att = e.attendance?.status ?? 'no_record';
        if (attendanceFilter !== att) return false;
      }
      if (statusFilter !== 'all') {
        if (statusFilter === 'no_task' && e.todayTasks.length > 0) return false;
        if (statusFilter === 'has_task' && e.todayTasks.length === 0) return false;
        if (statusFilter === 'pending' && e.pendingCount === 0) return false;
        if (statusFilter === 'changes_req' && e.changesRequiredCount === 0) return false;
      }
      return true;
    });
  }, [employees, empFilter, attendanceFilter, statusFilter]);

  // Filtered tasks for task monitoring section
  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (empFilter !== 'all' && t.team_member_id !== empFilter) return false;
      if (dateFilter && t.due_date !== dateFilter) return false;
      if (statusFilter !== 'all' && statusFilter !== 'no_task' && statusFilter !== 'has_task') {
        if (t.status !== statusFilter) return false;
      }
      return true;
    });
  }, [allTasks, empFilter, dateFilter, statusFilter]);

  async function openEmployeeDetail(emp: EmployeeRow) {
    setSelectedEmp(emp);
    setEmpDetail(null);
    setDetailLoading(true);
    try {
      const memberId = emp.member.id;
      const [empTasksRes, empAttendanceRes, empLeavesRes, empHistoryRes] = await Promise.all([
        supabase.from('tasks').select('*, client:clients(*), team_member:team_members(*)').eq('team_member_id', memberId).order('updated_at', { ascending: false }).limit(50),
        supabase.from('attendance_records').select('*, team_member:team_members(*)').eq('team_member_id', memberId).order('attendance_date', { ascending: false }).limit(30),
        supabase.from('leaves').select('*').or(`user_id.eq.${emp.profile?.id ?? ''}`).order('created_at', { ascending: false }).limit(20),
        supabase.from('task_history').select('*').eq('task_id', 'in').in('task_id', (await supabase.from('tasks').select('id').eq('team_member_id', memberId).limit(50)).data?.map((t: { id: string }) => t.id) ?? []).order('changed_at', { ascending: false }).limit(30),
      ]);

      const empTasks = (empTasksRes.data ?? []) as Task[];
      const empAttendance = (empAttendanceRes.data ?? []) as AttendanceRecord[];
      const empLeaves = (empLeavesRes.data ?? []) as Leave[];

      // Get task history separately
      const taskIds = empTasks.map((t) => t.id);
      let empHistory: TaskHistory[] = [];
      if (taskIds.length > 0) {
        const { data: histData } = await supabase
          .from('task_history')
          .select('*')
          .in('task_id', taskIds)
          .order('changed_at', { ascending: false })
          .limit(30);
        empHistory = (histData ?? []) as TaskHistory[];
      }

      setEmpDetail({ tasks: empTasks, attendance: empAttendance, leaves: empLeaves, history: empHistory });
    } catch (err) {
      console.error('Employee detail error', err);
    }
    setDetailLoading(false);
  }

  async function openTaskHistory(taskId: string, taskName: string) {
    setHistoryTaskName(taskName);
    setHistoryLoading(true);
    const { data } = await supabase.from('task_history').select('*').eq('task_id', taskId).order('changed_at', { ascending: false }).limit(50);
    setTaskHistory((data ?? []) as TaskHistory[]);
    setHistoryLoading(false);
  }

  async function logAudit(action: string, targetType: string, targetId: string, targetLabel: string, details?: string) {
    if (!user) return;
    await supabase.from('master_audit_log').insert({
      performed_by: user.id,
      performed_by_email: user.email ?? '',
      action,
      target_type: targetType,
      target_id: targetId,
      target_label: targetLabel,
      details: details ?? null,
    });
  }

  async function saveNote() {
    if (!noteTarget || !noteText.trim()) return;
    setNoteSaving(true);
    await supabase.from('task_notes').insert({
      task_id: noteTarget.todayTasks[0]?.id ?? null,
      content: `[Admin Note from Viraj] ${noteText.trim()}`,
      created_by: user?.id ?? null,
    }).then(() => {});
    await logAudit('add_admin_note', 'employee', noteTarget.member.id, noteTarget.member.name, noteText.trim());
    setNoteSaving(false);
    setNoteTarget(null);
    setNoteText('');
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-[#17243d]">
            <Activity className="h-5 w-5 text-[#1478d4]" /> Master Control Center
          </h1>
          <p className="text-sm text-[#5a6c84]">Live monitoring of all CRM activity — Viraj Primary Master only</p>
        </div>
        <Button variant="subtle" onClick={load} disabled={refreshing}>
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <StatCard label="Active Employees" value={stats.activeCount} icon={<Users className="h-4 w-4" />} color="text-[#1478d4]" />
        <StatCard label="Present" value={stats.present} icon={<CheckCircle2 className="h-4 w-4" />} color="text-emerald-600" />
        <StatCard label="Absent" value={stats.absent} icon={<XCircle className="h-4 w-4" />} color="text-rose-600" />
        <StatCard label="No Task Today" value={stats.noTask} icon={<AlertTriangle className="h-4 w-4" />} color="text-amber-600" />
        <StatCard label="Pending Tasks" value={stats.totalPending} icon={<Clock className="h-4 w-4" />} color="text-blue-600" />
        <StatCard label="Changes Required" value={stats.totalChangesReq} icon={<AlertTriangle className="h-4 w-4" />} color="text-orange-600" />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[#e5ebf3] bg-amber-50/50 px-5 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[#17243d]">
              <ShieldAlert className="h-4 w-4 text-amber-600" /> Alerts ({alerts.length})
            </h2>
          </div>
          <div className="divide-y divide-[#edf1f6]">
            {alerts.map((alert, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3">
                <div className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${alert.level === 'error' ? 'bg-rose-100' : 'bg-amber-100'}`}>
                  {alert.level === 'error'
                    ? <XCircle className="h-3.5 w-3.5 text-rose-600" />
                    : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-[#17243d]">{alert.title}</p>
                  <p className="whitespace-pre-line text-xs text-[#5a6c84]">{alert.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Anomaly Detection */}
      <AnomalyDetection />

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Employee" value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
            <option value="all">All Employees</option>
            {employees.filter((e) => !MASTER_EMAILS.has(e.member.email?.toLowerCase() ?? '')).map((e) => (
              <option key={e.member.id} value={e.member.id}>{e.member.name}</option>
            ))}
          </Select>
          <Select label="Task Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="no_task">No Task Today</option>
            <option value="has_task">Has Task Today</option>
            <option value="pending">Has Pending</option>
            <option value="changes_req">Changes Required</option>
            <option value="not_started">Not Started</option>
            <option value="started">Started</option>
            <option value="in_progress">In Progress</option>
            <option value="in_approval">In Approval</option>
            <option value="approved">Approved</option>
            <option value="not_approved">Not Approved</option>
          </Select>
          <Select label="Attendance" value={attendanceFilter} onChange={(e) => setAttendanceFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="excused">Excused</option>
            <option value="no_record">No Record</option>
          </Select>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[#3d5070]">Task Date</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full rounded-lg border border-[#dbe5f0] bg-white px-3 py-2 text-sm text-[#17243d] outline-none focus:border-[#1478d4] focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
      </Card>

      {/* Employee Overview */}
      <Card className="overflow-hidden">
        <div className="border-b border-[#e5ebf3] px-5 py-4">
          <h2 className="text-sm font-semibold text-[#17243d]">Employee Overview ({filteredEmployees.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e5ebf3] text-left text-xs text-[#5a6c84]">
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 text-center font-medium">Attendance</th>
                <th className="px-4 py-3 text-center font-medium">Tasks Today</th>
                <th className="px-4 py-3 text-center font-medium">Pending</th>
                <th className="px-4 py-3 text-center font-medium">In Progress</th>
                <th className="px-4 py-3 text-center font-medium">In Approval</th>
                <th className="px-4 py-3 text-center font-medium">Approved</th>
                <th className="px-4 py-3 text-center font-medium">Changes Req</th>
                <th className="px-4 py-3 font-medium">Last Activity</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1f6]">
              {filteredEmployees.map((emp) => {
                const att = emp.attendance;
                const attColor = att?.status === 'absent' ? 'text-rose-600' : att?.status === 'excused' ? 'text-amber-600' : att?.status === 'present' || att?.status === 'on_time' ? 'text-emerald-600' : 'text-[#5a6c84]';
                return (
                  <tr key={emp.member.id} className="cursor-pointer transition-all duration-200 hover:bg-cyan-500/[0.04]" onClick={() => openEmployeeDetail(emp)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="grid h-8 w-8 place-items-center rounded-full bg-cyan-500/10 text-xs font-semibold text-[#3d5070]">{emp.member.name.charAt(0)}</div>
                        <div>
                          <p className="font-medium text-[#17243d]">{emp.member.name}</p>
                          <p className="text-xs text-[#5a6c84]">{emp.member.email ?? 'No email'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs capitalize text-[#5a6c84]">{emp.profile?.role?.replace('_', ' ') ?? '—'}</td>
                    <td className={`px-4 py-3 text-center text-xs font-medium ${attColor}`}>{att?.status ?? 'no record'}</td>
                    <td className="px-4 py-3 text-center font-medium text-[#17243d]">{emp.todayTasks.length}</td>
                    <td className="px-4 py-3 text-center text-[#3d5070]">{emp.pendingCount}</td>
                    <td className="px-4 py-3 text-center text-blue-600">{emp.inProgressCount}</td>
                    <td className="px-4 py-3 text-center text-sky-600">{emp.inApprovalCount}</td>
                    <td className="px-4 py-3 text-center text-emerald-600">{emp.approvedCount}</td>
                    <td className="px-4 py-3 text-center text-orange-600">{emp.changesRequiredCount}</td>
                    <td className="px-4 py-3 text-xs text-[#5a6c84]">{timeAgo(emp.lastActivity)}</td>
                    <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-[#5a6c84]" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredEmployees.length === 0 && <EmptyState title="No employees match the current filters" />}
        </div>
      </Card>

      {/* Task Monitoring */}
      <Card className="overflow-hidden">
        <div className="border-b border-[#e5ebf3] px-5 py-4">
          <h2 className="text-sm font-semibold text-[#17243d]">Task Monitoring ({filteredTasks.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e5ebf3] text-left text-xs text-[#5a6c84]">
                <th className="px-4 py-3 font-medium">Task</th>
                <th className="px-4 py-3 font-medium">Assigned To</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Due Date</th>
                <th className="px-4 py-3 font-medium">Last Updated</th>
                <th className="px-4 py-3 font-medium">Inactivity</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1f6]">
              {filteredTasks.slice(0, 50).map((task) => {
                const stale = hoursSince(task.updated_at);
                const isStale = stale >= 3 && ['not_started', 'started', 'in_progress'].includes(task.status);
                const isOverdue = task.due_date && task.due_date < today && ['not_started', 'started', 'in_progress', 'in_approval'].includes(task.status);
                return (
                  <tr key={task.id} className="transition-all duration-200 hover:bg-cyan-500/[0.04]">
                    <td className="px-4 py-3 font-medium text-[#17243d]">{task.name}</td>
                    <td className="px-4 py-3 text-[#3d5070]">{task.team_member?.name ?? 'Unassigned'}</td>
                    <td className="px-4 py-3"><StatusBadge status={task.status} /></td>
                    <td className="px-4 py-3 text-xs text-[#5a6c84]">{task.due_date ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-[#5a6c84]">{timeAgo(task.updated_at)}</td>
                    <td className="px-4 py-3">
                      {isStale && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">{Math.floor(stale)}h stale</span>}
                      {isOverdue && <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700">Overdue</span>}
                      {!isStale && !isOverdue && <span className="text-xs text-[#5a6c84]">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={(e) => { e.stopPropagation(); openTaskHistory(task.id, task.name); }} className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] transition hover:bg-cyan-500/10 hover:text-[#1478d4]" title="View task history">
                        <History className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredTasks.length === 0 && <EmptyState title="No tasks match the current filters" />}
        </div>
      </Card>

      {/* Employee Detail Modal */}
      {selectedEmp && (
        <Modal open={!!selectedEmp} onClose={() => { setSelectedEmp(null); setEmpDetail(null); }} title={selectedEmp.member.name} maxWidth="max-w-3xl">
          {detailLoading ? (
            <PageLoader />
          ) : empDetail ? (
            <EmployeeDetail
              emp={selectedEmp}
              detail={empDetail}
              today={today}
              onOpenHistory={openTaskHistory}
              onAddNote={(e) => { setNoteTarget(e); setNoteText(''); }}
            />
          ) : (
            <EmptyState title="Could not load employee details" />
          )}
        </Modal>
      )}

      {/* Task History Modal */}
      <Modal open={taskHistory.length > 0 || historyLoading} onClose={() => { setTaskHistory([]); setHistoryLoading(false); }} title={`Task History: ${historyTaskName}`} maxWidth="max-w-2xl">
        {historyLoading ? <PageLoader /> : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {taskHistory.length === 0 ? <EmptyState title="No history recorded for this task" /> : taskHistory.map((h) => (
              <div key={h.id} className="flex items-start gap-3 rounded-lg border border-[#edf1f6] p-3">
                <History className="mt-0.5 h-4 w-4 shrink-0 text-[#1478d4]" />
                <div className="flex-1">
                  <p className="text-sm text-[#17243d]">
                    <span className="font-medium">{h.field_name.replace(/_/g, ' ')}</span>: {h.old_value ?? '—'} → {h.new_value ?? '—'}
                  </p>
                  <p className="text-xs text-[#5a6c84]">{h.action} · {formatDateTime(h.changed_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Admin Note Modal */}
      <Modal open={!!noteTarget} onClose={() => { setNoteTarget(null); setNoteText(''); }} title={`Add Admin Note — ${noteTarget?.member.name ?? ''}`}>
        <div className="space-y-4">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            placeholder="Add an administrative note..."
            className="w-full resize-none rounded-lg border border-[#dbe5f0] bg-white px-3 py-2 text-sm text-[#17243d] outline-none focus:border-[#1478d4] focus:ring-2 focus:ring-blue-100"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setNoteTarget(null); setNoteText(''); }}>Cancel</Button>
            <Button onClick={saveNote} disabled={noteSaving || !noteText.trim()}>{noteSaving ? 'Saving...' : 'Save Note'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-xl border border-[#e5ebf3] bg-white p-4 transition-all duration-200 hover:border-cyan-400/40 hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#5a6c84]">{label}</p>
        <span className={color}>{icon}</span>
      </div>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

interface EmployeeDetailData {
  tasks: Task[];
  attendance: AttendanceRecord[];
  leaves: Leave[];
  history: TaskHistory[];
}

function EmployeeDetail({
  emp, detail, today, onOpenHistory, onAddNote,
}: {
  emp: EmployeeRow;
  detail: EmployeeDetailData;
  today: string;
  onOpenHistory: (taskId: string, taskName: string) => void;
  onAddNote: (emp: EmployeeRow) => void;
}) {
  const todayTasks = detail.tasks.filter((t) => t.due_date === today);
  const pendingTasks = detail.tasks.filter((t) => ['not_started', 'started', 'in_progress', 'in_approval'].includes(t.status));
  const empAlerts: AlertItem[] = [];
  if (emp.todayTasks.length === 0) empAlerts.push({ level: 'warning', title: 'No task today', detail: 'No task assigned for today.' });
  if (emp.attendance?.status === 'absent') empAlerts.push({ level: 'warning', title: 'Absent', detail: `Reason: ${emp.absentSubmission?.reason.replace(/_/g, ' ') ?? 'not submitted'}` });
  if (emp.changesRequiredCount > 0) empAlerts.push({ level: 'warning', title: 'Changes required', detail: `${emp.changesRequiredCount} task(s) need changes.` });

  return (
    <div className="max-h-[70vh] space-y-5 overflow-y-auto">
      {/* Profile summary */}
      <div className="flex items-center gap-3 rounded-lg border border-[#edf1f6] bg-[#fbfcfe] p-3">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-cyan-500/10 text-lg font-semibold text-[#3d5070]">{emp.member.name.charAt(0)}</div>
        <div className="flex-1">
          <p className="font-semibold text-[#17243d]">{emp.member.name}</p>
          <p className="text-xs text-[#5a6c84]">{emp.member.email ?? 'No email'} · {emp.profile?.role?.replace('_', ' ') ?? 'no role'} · {emp.member.workspace?.name ?? 'No workspace'}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="subtle" onClick={() => onAddNote(emp)}><FileText className="h-3 w-3" /> Add Note</Button>
        </div>
      </div>

      {/* Alerts */}
      {empAlerts.length > 0 && (
        <div className="space-y-2">
          {empAlerts.map((a, i) => (
            <div key={i} className={`flex items-start gap-2 rounded-lg p-3 text-xs ${a.level === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
              {a.level === 'error' ? <XCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
              <div><span className="font-medium">{a.title}:</span> {a.detail}</div>
            </div>
          ))}
        </div>
      )}

      {/* Today's tasks */}
      <div>
        <h4 className="mb-2 text-xs font-semibold text-[#5a6c84]">Today's Tasks ({todayTasks.length})</h4>
        <div className="space-y-1.5">
          {todayTasks.length === 0 ? <p className="text-xs text-[#5a6c84]">No tasks for today.</p> : todayTasks.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-lg border border-[#edf1f6] px-3 py-2">
              <span className="flex-1 text-sm text-[#17243d]">{t.name}</span>
              <StatusBadge status={t.status} />
              <button onClick={() => onOpenHistory(t.id, t.name)} className="grid h-6 w-6 place-items-center rounded text-[#5a6c84] hover:bg-cyan-500/10 hover:text-[#1478d4]"><History className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Pending tasks */}
      <div>
        <h4 className="mb-2 text-xs font-semibold text-[#5a6c84]">Pending Tasks ({pendingTasks.length})</h4>
        <div className="space-y-1.5">
          {pendingTasks.length === 0 ? <p className="text-xs text-[#5a6c84]">No pending tasks.</p> : pendingTasks.slice(0, 10).map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-lg border border-[#edf1f6] px-3 py-2">
              <span className="flex-1 text-sm text-[#17243d]">{t.name}</span>
              <span className="text-xs text-[#5a6c84]">{t.due_date ?? '—'}</span>
              <StatusBadge status={t.status} />
              <button onClick={() => onOpenHistory(t.id, t.name)} className="grid h-6 w-6 place-items-center rounded text-[#5a6c84] hover:bg-cyan-500/10 hover:text-[#1478d4]"><History className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <h4 className="mb-2 text-xs font-semibold text-[#5a6c84]">Recent Activity (last 30 changes)</h4>
        <div className="max-h-48 space-y-1.5 overflow-y-auto">
          {detail.history.length === 0 ? <p className="text-xs text-[#5a6c84]">No recent activity.</p> : detail.history.map((h) => (
            <div key={h.id} className="flex items-center gap-2 rounded-lg border border-[#edf1f6] px-3 py-1.5 text-xs">
              <History className="h-3 w-3 shrink-0 text-[#1478d4]" />
              <span className="flex-1 text-[#17243d]"><span className="font-medium">{h.field_name.replace(/_/g, ' ')}</span>: {h.old_value ?? '—'} → {h.new_value ?? '—'}</span>
              <span className="text-[#5a6c84]">{formatDateTime(h.changed_at)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Attendance history */}
      <div>
        <h4 className="mb-2 text-xs font-semibold text-[#5a6c84]">Attendance History (last 30 days)</h4>
        <div className="max-h-48 space-y-1.5 overflow-y-auto">
          {detail.attendance.length === 0 ? <p className="text-xs text-[#5a6c84]">No attendance records.</p> : detail.attendance.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-lg border border-[#edf1f6] px-3 py-1.5 text-xs">
              <span className="flex-1 text-[#17243d]">{a.attendance_date}</span>
              <span className={`font-medium ${a.status === 'absent' ? 'text-rose-600' : a.status === 'excused' ? 'text-amber-600' : 'text-emerald-600'}`}>{a.status}</span>
              {a.manually_overridden && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">Overridden</span>}
              <span className="text-[#5a6c84]">tasks: {a.task_count_at_check ?? '—'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Leave history */}
      <div>
        <h4 className="mb-2 text-xs font-semibold text-[#5a6c84]">Leave History</h4>
        <div className="space-y-1.5">
          {detail.leaves.length === 0 ? <p className="text-xs text-[#5a6c84]">No leave records.</p> : detail.leaves.slice(0, 10).map((l) => (
            <div key={l.id} className="flex items-center gap-2 rounded-lg border border-[#edf1f6] px-3 py-1.5 text-xs">
              <CalendarDays className="h-3 w-3 shrink-0 text-[#1478d4]" />
              <span className="flex-1 text-[#17243d]">{l.from_date} → {l.to_date}</span>
              <span className="capitalize text-[#5a6c84]">{l.day_type}</span>
              <span className={`font-medium ${l.status === 'approved' ? 'text-emerald-600' : l.status === 'rejected' ? 'text-rose-600' : 'text-amber-600'}`}>{l.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
