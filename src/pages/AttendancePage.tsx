import { FormEvent, useMemo, useState } from 'react';
import { CalendarDays, Download, Filter, Mail, Pencil, Users } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { useTeamMembers } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { useAttendance, useTaskCounts, KAPIL_EMAIL, istDate } from '@/lib/useAttendance';
import type { AttendanceRecord, AttendanceStatus, TeamMember } from '@/lib/types';
import { supabase as supabaseClient } from '@/lib/supabase';
import { Button, Card, EmptyState, Input, Modal, Select, Spinner } from '@/components/ui';

const VIRAJ_EMAIL = 'viraj.digitalsky360@gmail.com';
const ROSTAN_EMAIL = 'softrockind@gmail.com';
const MASTER_EMAILS = [VIRAJ_EMAIL, KAPIL_EMAIL];
const SEND_EMAIL_RECIPIENTS = [VIRAJ_EMAIL, KAPIL_EMAIL, ROSTAN_EMAIL];

type ReportMode = 'daily' | 'monthly' | 'custom';

function monthStart(date: string): string { return `${date.slice(0, 7)}-01`; }
function nextMonthStart(date: string): string {
  const [y, m] = date.slice(0, 7).split('-').map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'present': return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20';
    case 'excused': return 'bg-blue-500/15 text-blue-700 border-blue-500/20';
    case 'absent': return 'bg-red-500/15 text-red-700 border-red-500/20';
    case 'on_time': return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20';
    case 'late': return 'bg-amber-500/15 text-amber-700 border-amber-500/20';
    case 'half_day': return 'bg-blue-500/15 text-blue-700 border-blue-500/20';
    case 'leave': return 'bg-cyan-500/15 text-cyan-700 border-cyan-500/20';
    default: return 'bg-cyan-500/10 text-[#5a6c84] border-[#e5ebf3]';
  }
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    present: 'Present',
    excused: 'Excused',
    absent: 'Absent',
    on_time: 'On Time',
    late: 'Late',
    half_day: 'Half Day',
    leave: 'Leave',
  };
  return labels[status] ?? status;
}

function formatIST(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function AttendancePage() {
  const { members } = useTeamMembers();
  const { isMaster, user, profile } = useAuth();
  const userEmail = (user?.email ?? '').toLowerCase();
  const isPrimaryMaster = isMaster && userEmail === VIRAJ_EMAIL;
  const isAttendanceMaster = isMaster && MASTER_EMAILS.includes(userEmail);

  const [reportMode, setReportMode] = useState<ReportMode>('daily');
  const [selectedDate, setSelectedDate] = useState(istDate());
  const [fromDate, setFromDate] = useState(istDate());
  const [toDate, setToDate] = useState(istDate());
  const [employeeFilter, setEmployeeFilter] = useState('');

  const scope = useMemo(() => {
    let from = selectedDate;
    let to = selectedDate;
    if (reportMode === 'monthly') { from = monthStart(selectedDate); to = nextMonthStart(selectedDate); }
    else if (reportMode === 'custom') { from = fromDate; to = toDate; }
    return { fromDate: from, toDate: to, teamMemberId: employeeFilter || null };
  }, [reportMode, selectedDate, fromDate, toDate, employeeFilter]);

  const { records, loading, reload } = useAttendance(scope);

  const attendanceMembers = useMemo(
    () => members.filter((m) => (m.email ?? '').toLowerCase() !== KAPIL_EMAIL),
    [members],
  );

  const memberMap = useMemo(() => {
    const map = new Map<string, TeamMember>();
    attendanceMembers.forEach((m) => map.set(m.id, m));
    return map;
  }, [attendanceMembers]);

  const today = istDate();
  const isTodayView = scope.fromDate === today && scope.toDate === today;

  const { counts: taskCounts } = useTaskCounts(
    isTodayView ? today : scope.fromDate,
    attendanceMembers,
  );

  // Build display rows: for today's view, show ALL active members (even those without records)
  // For other dates, show only existing records
  type DisplayRow = {
    record: AttendanceRecord | null;
    member: TeamMember | null;
    taskCount: number;
  };

  const displayRows = useMemo<DisplayRow[]>(() => {
    if (!isTodayView) {
      return records.map((r) => ({
        record: r,
        member: r.team_member ?? memberMap.get(r.team_member_id) ?? null,
        taskCount: 0,
      }));
    }

    // Today view: show all active members
    const rows: DisplayRow[] = [];
    const recordByMember = new Map<string, AttendanceRecord>();
    for (const r of records) recordByMember.set(r.team_member_id, r);

    for (const m of attendanceMembers) {
      const rec = recordByMember.get(m.id) ?? null;
      const tc = taskCounts[m.id] ?? 0;
      rows.push({ record: rec, member: m, taskCount: tc });
    }
    return rows;
  }, [isTodayView, records, attendanceMembers, memberMap, taskCounts]);

  // Modal state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<AttendanceStatus>('present');
  const [reason, setReason] = useState('');

  const [editDate, setEditDate] = useState(istDate());
  const [mailSending, setMailSending] = useState<string | null>(null);
  const [mailResult, setMailResult] = useState<{
    key: string;
    recipients: { email: string; name: string; status: 'sent' | 'failed' }[];
  } | null>(null);

  async function sendAbsentMail(memberName: string, memberKey: string, recDate: string, taskCount: number, reason: string) {
    setMailSending(memberKey);
    setMailResult(null);
    const { data: { session } } = await supabaseClient.auth.getSession();
    const token = session?.access_token ?? '';
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const sendUrl = `${supabaseUrl}/functions/v1/send-email`;
    const subject = `SOFTROCK — Attendance Alert: ${memberName} — Absent on ${recDate}`;
    const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <h2 style="color:#1a1a2e;">SOFTROCK — Attendance Alert</h2>
  <p>This is an automated attendance report.</p>
  <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px;">
    <thead><tr style="background:#f4f4f4;"><th>Employee</th><th>Date</th><th>Task Count</th><th>Status</th><th>Reason</th></tr></thead>
    <tbody>
      <tr>
        <td>${memberName}</td>
        <td>${recDate}</td>
        <td>${taskCount}</td>
        <td style="color:#c0392b;"><strong>Absent</strong></td>
        <td>${reason || 'No task added'}</td>
      </tr>
    </tbody>
  </table>
  <p style="color:#888;font-size:12px;margin-top:20px;">Sent by SOFTROCK CRM attendance system.</p>
</div>`;
    const recipientLabels: Record<string, string> = { [VIRAJ_EMAIL]: 'Viraj', [KAPIL_EMAIL]: 'Kapil', [ROSTAN_EMAIL]: 'Rostan' };
    const results: { email: string; name: string; status: 'sent' | 'failed' }[] = [];
    for (const recipient of SEND_EMAIL_RECIPIENTS) {
      let status: 'sent' | 'failed' = 'failed';
      try {
        const res = await fetch(sendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ to: recipient, subject, html, notificationType: 'attendance_absent', triggeredBy: 'manual' }),
        });
        if (res.ok) {
          const json = await res.json().catch(() => null);
          status = json?.sent === false ? 'failed' : 'sent';
        }
      } catch { status = 'failed'; }
      results.push({ email: recipient, name: recipientLabels[recipient] ?? recipient, status });
    }
    setMailSending(null);
    setMailResult({ key: memberKey, recipients: results });
  }

  function openEdit(record: AttendanceRecord | null, member: TeamMember | null, date: string) {
    setEditing(record);
    setEditMember(member);
    setEditDate(date);
    setNewStatus(record?.status ?? 'present');
    setReason(record?.override_reason ?? record?.notes ?? '');
    setError(null);
    setOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editMember) { setError('No employee selected.'); return; }
    setBusy(true); setError(null);

    const recDate = editing?.attendance_date ?? editDate;
    const payload = {
      team_member_id: editMember.id,
      attendance_date: recDate,
      status: newStatus,
      manually_overridden: true,
      override_reason: reason.trim() || null,
      overridden_by: user?.id ?? null,
      overridden_at: new Date().toISOString(),
      notes: reason.trim() || null,
    };

    let result;
    if (editing) {
      result = await supabase.from('attendance_records').update(payload).eq('id', editing.id);
    } else {
      result = await supabase.from('attendance_records').insert(payload);
    }
    setBusy(false);
    if (result.error) {
      setError('Could not save. This employee may already have a record for that date.');
      return;
    }
    setOpen(false);
    reload();
  }

  function exportExcel() {
    const rows = displayRows.map((r) => ({
      'Employee Name': r.member?.name ?? 'Unknown',
      'Date': r.record?.attendance_date ?? (isTodayView ? today : scope.fromDate),
      'Task Count': r.taskCount,
      'Attendance': r.record ? statusLabel(r.record.status) : (r.taskCount > 0 ? 'Present' : 'No Record'),
      'Reason': r.record?.override_reason ?? r.record?.notes ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    const datePart = reportMode === 'custom' ? `${fromDate}_to_${toDate}` : selectedDate;
    XLSX.writeFile(wb, `attendance_report_${datePart}.xlsx`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-[#17243d]"><CalendarDays className="h-5 w-5 text-cyan-600" /> Attendance</h1>
          <p className="mt-1 text-sm text-[#5a6c84]">
            {isAttendanceMaster ? 'Task-based attendance. At 10:40 AM IST, employees with 0 tasks are marked ABSENT.' : 'View your attendance.'}
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-[#5a6c84] hover:text-[#17243d]">x</button>
        </div>
      )}

      {/* Report filters */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#e5ebf3] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[#5a6c84]" />
            <h2 className="text-sm font-semibold text-[#17243d]">Attendance Report</h2>
          </div>
          {isAttendanceMaster && (
            <Button onClick={exportExcel} variant="subtle"><Download className="h-4 w-4" /> Export Excel</Button>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3 px-5 py-4">
          <div className="min-w-[120px]">
            <Select label="Report type" value={reportMode} onChange={(e) => setReportMode(e.target.value as ReportMode)}>
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom Range</option>
            </Select>
          </div>
          {reportMode === 'daily' && (
            <div className="min-w-[140px]"><Input label="Date" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} /></div>
          )}
          {reportMode === 'monthly' && (
            <div className="min-w-[140px]"><Input label="Month" type="month" value={selectedDate.slice(0, 7)} onChange={(e) => setSelectedDate(e.target.value + '-01')} /></div>
          )}
          {reportMode === 'custom' && (
            <>
              <div className="min-w-[140px]"><Input label="From" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
              <div className="min-w-[140px]"><Input label="To" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
            </>
          )}
          {isAttendanceMaster && (
            <div className="min-w-[160px] flex-1">
              <Select label="Employee" value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
                <option value="">All Employees</option>
                {attendanceMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </div>
          )}
        </div>
      </Card>

      {/* Records table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : displayRows.length === 0 ? (
          <EmptyState title="No attendance records found" hint="Adjust filters or wait for the 10:40 AM auto-check." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-[#e5ebf3] text-xs uppercase tracking-wide text-[#5a6c84]">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Task Count</th>
                  <th className="px-5 py-3">Attendance</th>
                  <th className="px-5 py-3">Reason</th>
                  {isPrimaryMaster && <th className="px-5 py-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1f6]">
                {displayRows.map((row) => {
                  const memberName = row.member?.name ?? 'Unknown';
                  const recDate = row.record?.attendance_date ?? (isTodayView ? today : scope.fromDate);
                  const displayStatus = row.record?.status ?? (isTodayView ? (row.taskCount > 0 ? 'present' : 'pending') : 'no_record');
                  const reason = row.record?.override_reason ?? row.record?.notes ?? '';
                  const isManual = !!row.record?.manually_overridden;
                  const isAbsent = row.record?.status === 'absent';
                  const rowKey = row.member?.id ?? row.record?.id ?? recDate;

                  return (
                    <tr key={rowKey} className="transition-all duration-200 hover:bg-cyan-500/[0.03]">
                      <td className="px-5 py-3 font-medium text-[#17243d]">{memberName}</td>
                      <td className="px-5 py-3 text-[#5a6c84]">{recDate}</td>
                      <td className="px-5 py-3 text-[#5a6c84]">{row.taskCount}</td>
                      <td className="px-5 py-3">
                        {displayStatus === 'pending' ? (
                          <span className="rounded-full border border-[#e5ebf3] bg-cyan-500/10 px-2 py-1 text-xs text-[#5a6c84]">Pending</span>
                        ) : displayStatus === 'no_record' ? (
                          <span className="rounded-full border border-[#e5ebf3] bg-cyan-500/10 px-2 py-1 text-xs text-[#5a6c84]">No Record</span>
                        ) : (
                          <span className={`rounded-full border px-2 py-1 text-xs ${statusBadgeClass(displayStatus)}`}>{statusLabel(displayStatus)}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-[#5a6c84]">{reason || '—'}</td>
                      {isPrimaryMaster && (
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {isManual ? (
                              <button
                                onClick={() => openEdit(row.record, row.member, recDate)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-700 transition-all duration-200 hover:bg-cyan-500/20 hover:scale-105 active:scale-95"
                                title={`Manually overridden at ${formatIST(row.record?.overridden_at ?? null)} — click to edit`}
                              >
                                <Pencil className="h-3 w-3" /> Manual
                              </button>
                            ) : (
                              <button
                                onClick={() => openEdit(row.record, row.member, recDate)}
                                className="rounded-lg p-2 text-[#5a6c84] transition-colors hover:bg-cyan-500/10 hover:text-[#17243d]"
                                title="Set manual attendance"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            )}
                            {isAbsent && (
                              <button
                                disabled={mailSending === rowKey}
                                onClick={() => sendAbsentMail(memberName, rowKey, recDate, row.taskCount, reason)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-700 transition-all duration-200 hover:bg-red-500/20 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Send absence alert email to Viraj, Kapil and Rostan"
                              >
                                {mailSending === rowKey ? <Spinner className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                                {mailSending === rowKey ? 'Sending...' : 'Send Mail'}
                              </button>
                            )}
                            {mailResult?.key === rowKey && (
                              <div className="flex flex-col gap-0.5">
                                {mailResult.recipients.map((r) => (
                                  <span key={r.email} className={`text-xs font-medium ${r.status === 'sent' ? 'text-emerald-700' : 'text-red-700'}`}>
                                    {r.name}: {r.status === 'sent' ? 'Sent' : 'Failed'}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex items-center gap-2 text-xs text-[#5a6c84]">
        <Users className="h-4 w-4" />
        At 10:40 AM IST, employees with 0 tasks for today are marked ABSENT. Employees with at least 1 task are marked PRESENT. Only Viraj (Primary Master) can manually override to PRESENT, EXCUSED, or ABSENT with a reason. Kapil is excluded.
      </div>

      {/* Edit modal — Primary Master (Viraj) only */}
      {isPrimaryMaster && (
        <Modal open={open} onClose={() => setOpen(false)} title="Edit Attendance">
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5a6c84]">Employee</label>
              <p className="text-sm font-semibold text-[#17243d]">{editMember?.name ?? '—'}</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5a6c84]">Date</label>
              <p className="text-sm text-[#17243d]">{editing?.attendance_date ?? editDate}</p>
            </div>
            <Select label="Attendance Status" value={newStatus} onChange={(e) => setNewStatus(e.target.value as AttendanceStatus)}>
              <option value="present">Present</option>
              <option value="excused">Excused</option>
              <option value="absent">Absent</option>
            </Select>
            <Input label="Reason / Note (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Task was delayed due to client issue" />
            {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
