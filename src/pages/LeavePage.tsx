import { useState, FormEvent, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useLeaves, useTeamMembers } from '@/lib/hooks';
import type { Leave, LeaveStatus, LeaveDayType } from '@/lib/types';
import { Card, PageLoader, EmptyState, Button, Input, Select, Textarea, Modal, Spinner } from '@/components/ui';
import { Plus, CalendarCheck, CalendarX, CalendarClock, Check, X, CalendarDays, Trash2, UserPlus, Pencil, Mail, MailCheck, MailX, RefreshCw } from 'lucide-react';
import type { LeaveEmailLog } from '@/lib/types';

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const leaveStatusStyles: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-700 border-amber-500/20',
  approved: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20',
  rejected: 'bg-red-500/15 text-red-700 border-red-500/20',
};
const leaveStatusLabel: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

function LeaveBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all duration-200 hover:shadow-md hover:shadow-current/20 ${leaveStatusStyles[status] ?? leaveStatusStyles.pending}`}>
      {leaveStatusLabel[status] ?? status}
    </span>
  );
}

export default function LeavePage() {
  const { user, isMaster, profile } = useAuth();
  const { leaves, loading, reload } = useLeaves();
  const { members } = useTeamMembers();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingLeave, setEditingLeave] = useState<Leave | null>(null);
  const [emailLogLeave, setEmailLogLeave] = useState<Leave | null>(null);
  const [emailLogs, setEmailLogs] = useState<LeaveEmailLog[]>([]);
  const [emailLogsLoading, setEmailLogsLoading] = useState(false);
  const [emailLogsError, setEmailLogsError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [dayType, setDayType] = useState<LeaveDayType>('full');
  const [reason, setReason] = useState('');
  const [leaveStatus, setLeaveStatus] = useState<LeaveStatus>('pending');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultEmployeeName = profile?.team_member?.name ?? profile?.display_name ?? profile?.email ?? '';

  const sortedMembers = useMemo(() => [...members].sort((a, b) => a.name.localeCompare(b.name)), [members]);

  function resetForm() {
    setFromDate(''); setToDate(''); setDayType('full'); setReason('');
    setLeaveStatus('pending'); setSelectedMemberId(''); setEditingLeave(null);
    setError(null);
  }

  function openNew() {
    resetForm();
    setModalOpen(true);
  }

  function openNewForEmployee() {
    resetForm();
    setSelectedMemberId(sortedMembers[0]?.id ?? '');
    setModalOpen(true);
  }

  async function fetchEmailLogs(leaveId: string) {
    setEmailLogsLoading(true);
    setEmailLogsError(null);
    const { data, error } = await supabase
      .from('leave_email_logs')
      .select('*')
      .eq('leave_id', leaveId)
      .order('created_at', { ascending: false });
    if (error) {
      setEmailLogsError(error.message);
      setEmailLogs([]);
    } else {
      setEmailLogs(data as LeaveEmailLog[]);
    }
    setEmailLogsLoading(false);
  }

  async function openEmailLog(leave: Leave) {
    setEmailLogLeave(leave);
    setEmailLogs([]);
    setEmailLogsError(null);
    await fetchEmailLogs(leave.id);
  }

  function closeEmailLog() {
    setEmailLogLeave(null);
    setEmailLogs([]);
    setEmailLogsLoading(false);
    setEmailLogsError(null);
  }

  const eventTypeLabel: Record<string, string> = {
    created: 'Leave Added',
    approved: 'Leave Approved',
    rejected: 'Leave Rejected',
    updated: 'Leave Updated',
  };

  function openEdit(leave: Leave) {
    resetForm();
    setEditingLeave(leave);
    setFromDate(leave.from_date);
    setToDate(leave.to_date);
    setDayType(leave.day_type);
    setReason(leave.reason ?? '');
    setLeaveStatus(leave.status);
    setModalOpen(true);
  }

  const selectedMember = useMemo(
    () => sortedMembers.find((m) => m.id === selectedMemberId) ?? null,
    [sortedMembers, selectedMemberId],
  );

  const isMasterCreateForOther = isMaster && !!selectedMemberId && !editingLeave;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!fromDate || !toDate) { setError('Start and End dates are required'); return; }
    if (new Date(toDate) < new Date(fromDate)) { setError('End date cannot be before start date'); return; }

    setBusy(true); setError(null);

    if (editingLeave) {
      const { error: updateError } = await supabase
        .from('leaves')
        .update({
          from_date: fromDate,
          to_date: toDate,
          day_type: dayType,
          reason: reason.trim() || null,
          status: leaveStatus,
        })
        .eq('id', editingLeave.id);
      if (updateError) { setError(updateError.message); setBusy(false); return; }
      setBusy(false);
      setModalOpen(false);
      resetForm();
      reload();
      return;
    }

    if (isMasterCreateForOther) {
      const member = selectedMember;
      if (!member) { setError('Please select a valid employee'); setBusy(false); return; }
      const { data: memberProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('team_member_id', member.id)
        .maybeSingle();
      const payload = {
        employee_name: member.name,
        from_date: fromDate,
        to_date: toDate,
        day_type: dayType,
        reason: reason.trim() || null,
        status: leaveStatus,
        created_by: user?.id ?? null,
        user_id: memberProfile?.id ?? null,
      };
      const { error: insertError } = await supabase.from('leaves').insert(payload);
      if (insertError) { setError(insertError.message); setBusy(false); return; }
      setBusy(false);
      setModalOpen(false);
      resetForm();
      reload();
      return;
    }

    const payload = {
      employee_name: defaultEmployeeName || 'Unknown',
      from_date: fromDate,
      to_date: toDate,
      day_type: dayType,
      reason: reason.trim() || null,
      status: leaveStatus,
      created_by: user?.id ?? null,
      user_id: user?.id ?? null,
    };
    const { error: insertError } = await supabase.from('leaves').insert(payload);
    if (insertError) { setError(insertError.message); setBusy(false); return; }
    setBusy(false);
    setModalOpen(false);
    resetForm();
    reload();
  }

  async function updateStatus(leave: Leave, newStatus: 'approved' | 'rejected') {
    const { error: updateError } = await supabase
      .from('leaves')
      .update({ status: newStatus })
      .eq('id', leave.id);
    if (updateError) { alert('Could not update: ' + updateError.message); return; }
    reload();
  }

  async function removeLeave(leave: Leave) {
    if (!confirm(`Delete leave request for ${leave.employee_name}?`)) return;
    const { error: deleteError } = await supabase.from('leaves').delete().eq('id', leave.id);
    if (deleteError) { alert('Could not delete: ' + deleteError.message); return; }
    reload();
  }

  if (loading) return <PageLoader />;

  const pending = leaves.filter((l) => l.status === 'pending');
  const approved = leaves.filter((l) => l.status === 'approved');
  const rejected = leaves.filter((l) => l.status === 'rejected');

  function LeaveRow({ leave }: { leave: Leave }) {
    const isOwn = leave.user_id === user?.id;
    const canManage = isMaster || isOwn;
    return (
      <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-all duration-200 hover:bg-cyan-500/[0.04] hover:translate-x-0.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cyan-500/15 text-xs font-semibold text-cyan-700">
          {leave.employee_name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-[140px] flex-1">
          <p className="text-sm font-medium text-[#17243d]">
            {leave.employee_name}
            {isMaster && leave.user_id !== user?.id && (
              <span className="ml-2 text-[10px] text-[#5a6c84]">{isOwn ? '(you)' : ''}</span>
            )}
          </p>
          <p className="flex items-center gap-1 text-xs text-[#5a6c84]">
            <CalendarDays className="h-3 w-3" />
            {fmtDate(leave.from_date)} — {fmtDate(leave.to_date)}
            <span className="ml-1 rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] uppercase">
              {leave.day_type === 'half' ? 'Half Day' : 'Full Day'}
            </span>
          </p>
          {leave.reason && <p className="mt-0.5 text-xs text-[#5a6c84]">{leave.reason}</p>}
        </div>
        <div className="flex items-center gap-2">
          <LeaveBadge status={leave.status} />
          {isMaster && leave.status === 'pending' && (
            <div className="flex gap-1">
              <button
                onClick={() => updateStatus(leave, 'approved')}
                className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] transition-all duration-200 hover:bg-cyan-500/10 hover:text-cyan-600 hover:scale-110 active:scale-95"
                title="Approve"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => updateStatus(leave, 'rejected')}
                className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] transition-all duration-200 hover:bg-red-500/10 hover:text-red-600 hover:scale-110 active:scale-95"
                title="Reject"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {canManage && (
            <button
              onClick={() => openEdit(leave)}
              className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] transition-all duration-200 hover:bg-cyan-500/10 hover:text-[#17243d] hover:scale-110 active:scale-95"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {canManage && (
            <button
              onClick={() => removeLeave(leave)}
              className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] transition-all duration-200 hover:bg-red-500/10 hover:text-red-600 hover:scale-110 active:scale-95"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {isMaster && (
            <button
              onClick={() => openEmailLog(leave)}
              className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] transition-all duration-200 hover:bg-sky-500/10 hover:text-sky-600 hover:scale-110 active:scale-95"
              title="Email History"
            >
              <Mail className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  const modalTitle = editingLeave
    ? `Edit Leave — ${editingLeave.employee_name}`
    : isMasterCreateForOther
      ? 'Add Leave for Employee'
      : 'Request Leave';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#17243d]">Leave Management</h1>
          <p className="text-sm text-[#5a6c84]">
            {isMaster
              ? `${leaves.length} total requests · ${pending.length} pending`
              : `${leaves.length} of your requests · ${pending.length} pending`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isMaster && (
            <Button variant="subtle" onClick={openNewForEmployee}>
              <UserPlus className="h-4 w-4" /> Add Leave for Employee
            </Button>
          )}
          <Button onClick={openNew}><Plus className="h-4 w-4" /> Request Leave</Button>
        </div>
      </div>

      {/* summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-amber-400/20 to-amber-500/5 p-4 transition-all duration-200 hover:shadow-lg hover:shadow-black/20">
          <div className="mb-2 flex items-center gap-2 text-[#5a6c84]">
            <CalendarClock className="h-4 w-4" /><span className="text-xs font-medium">Pending</span>
          </div>
          <p className="text-2xl font-semibold text-[#17243d]">{pending.length}</p>
        </Card>
        <Card className="bg-gradient-to-br from-cyan-400/20 to-cyan-500/5 p-4 transition-all duration-200 hover:shadow-lg hover:shadow-black/20">
          <div className="mb-2 flex items-center gap-2 text-[#5a6c84]">
            <CalendarCheck className="h-4 w-4" /><span className="text-xs font-medium">Approved</span>
          </div>
          <p className="text-2xl font-semibold text-[#17243d]">{approved.length}</p>
        </Card>
        <Card className="bg-gradient-to-br from-red-400/20 to-red-500/5 p-4 transition-all duration-200 hover:shadow-lg hover:shadow-black/20">
          <div className="mb-2 flex items-center gap-2 text-[#5a6c84]">
            <CalendarX className="h-4 w-4" /><span className="text-xs font-medium">Rejected</span>
          </div>
          <p className="text-2xl font-semibold text-[#17243d]">{rejected.length}</p>
        </Card>
        <Card className="bg-gradient-to-br from-slate-400/20 to-slate-500/5 p-4 transition-all duration-200 hover:shadow-lg hover:shadow-black/20">
          <div className="mb-2 flex items-center gap-2 text-[#5a6c84]">
            <CalendarDays className="h-4 w-4" /><span className="text-xs font-medium">Total</span>
          </div>
          <p className="text-2xl font-semibold text-[#17243d]">{leaves.length}</p>
        </Card>
      </div>

      {/* pending first */}
      {pending.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[#e5ebf3] px-5 py-3 text-sm font-semibold text-[#17243d]">Pending Requests</div>
          <div className="divide-y divide-[#edf1f6]">
            {pending.map((l) => <LeaveRow key={l.id} leave={l} />)}
          </div>
        </Card>
      )}

      {/* history */}
      <Card className="overflow-hidden">
        <div className="border-b border-[#e5ebf3] px-5 py-3 text-sm font-semibold text-[#17243d]">History</div>
        {approved.length === 0 && rejected.length === 0 ? (
          <EmptyState title="No past leave requests" />
        ) : (
          <div className="divide-y divide-[#edf1f6]">
            {[...approved, ...rejected].map((l) => <LeaveRow key={l.id} leave={l} />)}
          </div>
        )}
      </Card>

      {/* leave modal — create or edit */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); resetForm(); }} title={modalTitle}>
        <form onSubmit={save} className="space-y-4">
          {editingLeave ? (
            <div className="rounded-lg border border-[#e5ebf3] bg-cyan-500/[0.03] px-3 py-2.5 text-sm text-[#3d5070]">
              <span className="text-[#5a6c84]">Editing leave for: </span>
              <span className="font-medium text-[#17243d]">{editingLeave.employee_name}</span>
            </div>
          ) : isMasterCreateForOther ? (
            <Select label="Employee" value={selectedMemberId} onChange={(e) => setSelectedMemberId(e.target.value)} required>
              <option value="">Select employee</option>
              {sortedMembers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          ) : (
            <div className="rounded-lg border border-[#e5ebf3] bg-cyan-500/[0.03] px-3 py-2.5 text-sm text-[#3d5070]">
              <span className="text-[#5a6c84]">Requesting as: </span>
              <span className="font-medium text-[#17243d]">{defaultEmployeeName || 'Your account'}</span>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Start Date" type="date" required value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <Input label="End Date" type="date" required value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="Day Type" value={dayType} onChange={(e) => setDayType(e.target.value as LeaveDayType)}>
              <option value="full">Full Day</option>
              <option value="half">Half Day</option>
            </Select>
            {editingLeave && (
              <Select label="Status" value={leaveStatus} onChange={(e) => setLeaveStatus(e.target.value as LeaveStatus)}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </Select>
            )}
          </div>
          <Textarea label="Reason / Notes" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional reason for leave..." />
          {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-700">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => { setModalOpen(false); resetForm(); }}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving...' : editingLeave ? 'Save Changes' : 'Submit Request'}</Button>
          </div>
        </form>
      </Modal>

      {/* Email History modal — master only */}
      {emailLogLeave && (
        <Modal open onClose={closeEmailLog} title={`Email History — ${emailLogLeave.employee_name}`} maxWidth="max-w-2xl">
          <div className="space-y-4">
            <div className="rounded-lg border border-[#e5ebf3] bg-cyan-500/[0.03] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-[#17243d]">{emailLogLeave.employee_name}</p>
                  <p className="text-xs text-[#5a6c84]">
                    {fmtDate(emailLogLeave.from_date)}{emailLogLeave.from_date !== emailLogLeave.to_date ? ` — ${fmtDate(emailLogLeave.to_date)}` : ''}
                    <span className="ml-2 rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] uppercase">{emailLogLeave.day_type === 'half' ? 'Half Day' : 'Full Day'}</span>
                  </p>
                </div>
                <LeaveBadge status={emailLogLeave.status} />
              </div>
            </div>

            {emailLogsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner className="h-6 w-6" />
              </div>
            ) : emailLogsError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <p className="font-medium">Could not load email logs</p>
                <p className="mt-1 text-xs text-red-300/90">{emailLogsError}</p>
                <Button variant="subtle" size="sm" className="mt-3" onClick={() => emailLogLeave && fetchEmailLogs(emailLogLeave.id)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Retry
                </Button>
              </div>
            ) : emailLogs.length === 0 ? (
              <EmptyState title="No email logs yet" hint="Emails may still be sending. Try refreshing in a few seconds." />
            ) : (
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {emailLogs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-[#e5ebf3] bg-cyan-500/[0.03] px-4 py-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-[#e5ebf3] bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-[#3d5070]">
                        {eventTypeLabel[log.event_type] ?? log.event_type}
                      </span>
                      <span className="text-[11px] text-[#5a6c84]">
                        {new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      {log.send_status === 'sent' ? (
                        <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />
                      ) : (
                        <MailX className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="break-all text-sm text-[#17243d]">{log.recipient_email}</p>
                        <p className={`text-xs font-medium ${log.send_status === 'sent' ? 'text-cyan-600' : 'text-red-600'}`}>
                          {log.send_status === 'sent' ? 'Sent' : 'Failed'}
                        </p>
                        {log.resend_message_id && (
                          <p className="mt-0.5 text-[10px] text-[#5a6c84]">Resend ID: {log.resend_message_id}</p>
                        )}
                        {log.error_message && (
                          <p className="mt-1 rounded bg-red-500/10 px-2 py-1 text-xs font-medium text-red-700">
                            {log.error_message}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center pt-1">
              {emailLogLeave && !emailLogsLoading && !emailLogsError && (
                <Button variant="ghost" size="sm" onClick={() => fetchEmailLogs(emailLogLeave.id)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </Button>
              )}
              <Button variant="ghost" onClick={closeEmailLog} className="ml-auto">Close</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
