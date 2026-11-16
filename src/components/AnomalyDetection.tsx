import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Card, PageLoader, EmptyState, Button, Modal } from '@/components/ui';
import type { Task, TaskHistory, TeamMember } from '@/lib/types';
import { Search, Eye, XCircle, CheckCircle2, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react';

const MASTER_EMAILS = new Set(['viraj.digitalsky360@gmail.com', 'kapilprajapati9054@gmail.com', 'softrockind@gmail.com']);

function indiaDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function formatDateTime(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
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
function hoursBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 3600000;
}

type RiskLevel = 'high' | 'medium' | 'info';

interface Anomaly {
  key: string;
  type: string;
  employee: string | null;
  taskName: string | null;
  taskId: string | null;
  description: string;
  why: string;
  evidence: string;
  risk: RiskLevel;
  firstDetected: string;
  lastDetected: string;
}

interface DismissalRecord {
  anomaly_key: string;
  dismissed_by_email: string;
  dismissed_at: string;
}

interface InvestigateData {
  taskName: string;
  history: TaskHistory[];
}

export default function AnomalyDetection() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [dismissals, setDismissals] = useState<DismissalRecord[]>([]);
  const [showDismissed, setShowDismissed] = useState(false);
  const [investigateData, setInvestigateData] = useState<InvestigateData | null>(null);
  const [investigateLoading, setInvestigateLoading] = useState(false);
  const [dismissing, setDismissing] = useState<string | null>(null);

  const today = indiaDate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [tasksRes, historyRes, dismissalsRes] = await Promise.all([
        supabase.from('tasks').select('*, team_member:team_members(*, workspace:workspaces(*))').order('created_at', { ascending: false }),
        supabase.from('task_history').select('*').gte('changed_at', thirtyDaysAgo.toISOString()).order('changed_at', { ascending: false }).limit(2000),
        supabase.from('anomaly_dismissals').select('anomaly_key, dismissed_by_email, dismissed_at'),
      ]);

      const tasks = (tasksRes.data ?? []) as Task[];
      const history = (historyRes.data ?? []) as TaskHistory[];
      const dism = (dismissalsRes.data ?? []) as DismissalRecord[];

      setDismissals(dism);
      const detected = detectAnomalies(tasks, history, today);
      setAnomalies(detected);
    } catch (err) {
      console.error('Anomaly detection error', err);
    }
    setLoading(false);
  }, [today]);

  useEffect(() => { load(); }, [load]);

  const dismissedKeys = useMemo(() => new Set(dismissals.map((d) => d.anomaly_key)), [dismissals]);

  const visibleAnomalies = useMemo(() => {
    return anomalies.filter((a) => showDismissed ? true : !dismissedKeys.has(a.key));
  }, [anomalies, dismissedKeys, showDismissed]);

  const counts = useMemo(() => ({
    high: visibleAnomalies.filter((a) => a.risk === 'high').length,
    medium: visibleAnomalies.filter((a) => a.risk === 'medium').length,
    info: visibleAnomalies.filter((a) => a.risk === 'info').length,
    dismissed: anomalies.filter((a) => dismissedKeys.has(a.key)).length,
  }), [visibleAnomalies, anomalies, dismissedKeys]);

  async function dismissAnomaly(a: Anomaly) {
    if (!user) return;
    setDismissing(a.key);
    await supabase.from('anomaly_dismissals').upsert({
      anomaly_key: a.key,
      anomaly_type: a.type,
      employee_name: a.employee,
      task_name: a.taskName,
      risk_level: a.risk,
      description: a.description,
      evidence: a.evidence,
      first_detected: a.firstDetected,
      last_detected: a.lastDetected,
      dismissed_by: user.id,
      dismissed_by_email: user.email ?? '',
      dismissed_at: new Date().toISOString(),
    });
    setDismissals((prev) => [...prev, { anomaly_key: a.key, dismissed_by_email: user.email ?? '', dismissed_at: new Date().toISOString() }]);
    setDismissing(null);
  }

  async function investigate(a: Anomaly) {
    if (!a.taskId) return;
    setInvestigateLoading(true);
    const { data: taskData } = await supabase.from('tasks').select('name').eq('id', a.taskId).maybeSingle();
    const { data: histData } = await supabase.from('task_history').select('*').eq('task_id', a.taskId).order('changed_at', { ascending: false }).limit(50);
    setInvestigateData({ taskName: a.taskName ?? taskData?.name ?? 'Unknown', history: (histData ?? []) as TaskHistory[] });
    setInvestigateLoading(false);
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-4">
      {/* Top compact card */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 text-[#1478d4]" />
            <div>
              <h3 className="text-sm font-semibold text-[#17243d]">Anomalies Detected</h3>
              <p className="text-xs text-[#5a6c84]">{counts.high + counts.medium + counts.info} unresolved · {counts.dismissed} dismissed</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RiskPill level="high" count={counts.high} />
            <RiskPill level="medium" count={counts.medium} />
            <RiskPill level="info" count={counts.info} />
            <button
              onClick={() => setShowDismissed((v) => !v)}
              className="ml-2 rounded-lg border border-[#dbe5f0] px-2.5 py-1.5 text-xs font-medium text-[#5a6c84] transition hover:bg-[#eef5fc] hover:text-[#17243d]"
            >
              {showDismissed ? 'Hide Dismissed' : `Show Dismissed (${counts.dismissed})`}
            </button>
          </div>
        </div>
      </Card>

      {/* Anomaly list */}
      {visibleAnomalies.length === 0 ? (
        <Card><EmptyState title={showDismissed ? 'No anomalies found' : 'No unresolved anomalies'} hint={showDismissed ? 'No anomaly data to display.' : 'All detected anomalies have been reviewed or none were detected.'} /></Card>
      ) : (
        <div className="space-y-3">
          {[...visibleAnomalies].sort((a, b) => riskWeight(b.risk) - riskWeight(a.risk) || new Date(b.lastDetected).getTime() - new Date(a.lastDetected).getTime()).map((a) => {
            const dismissed = dismissedKeys.has(a.key);
            const dismissal = dismissals.find((d) => d.anomaly_key === a.key);
            return (
              <Card key={a.key} className={`p-4 ${dismissed ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <RiskIcon level={a.risk} />
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${riskBadge(a.risk)}`}>
                        {a.risk === 'high' ? 'HIGH RISK' : a.risk === 'medium' ? 'MEDIUM RISK' : 'INFORMATION'}
                      </span>
                      <span className="text-xs font-medium text-[#5a6c84]">{a.type.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="text-sm font-medium text-[#17243d]">{a.description}</p>
                    {a.employee && <p className="text-xs text-[#5a6c84]">Employee: <span className="font-medium text-[#3d5070]">{a.employee}</span>{a.taskName ? ` · Task: "${a.taskName}"` : ''}</p>}
                    <p className="text-xs text-[#5a6c84]"><span className="font-medium">Why unusual:</span> {a.why}</p>
                    <p className="text-xs text-[#5a6c84]"><span className="font-medium">Evidence:</span> {a.evidence}</p>
                    <p className="text-xs text-[#5a6c84]">First detected: {formatDateTime(a.firstDetected)} · Last detected: {formatDateTime(a.lastDetected)}</p>
                    {dismissed && dismissal && (
                      <p className="text-xs text-emerald-600">Dismissed by {dismissal.dismissed_by_email} at {formatDateTime(dismissal.dismissed_at)}</p>
                    )}
                  </div>
                  {!dismissed && (
                    <div className="flex shrink-0 flex-col gap-2">
                      {a.taskId && (
                        <Button size="sm" variant="subtle" onClick={() => investigate(a)}>
                          <Eye className="h-3 w-3" /> Investigate
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => dismissAnomaly(a)} disabled={dismissing === a.key}>
                        <XCircle className="h-3 w-3" /> {dismissing === a.key ? '...' : 'Dismiss'}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Investigate modal */}
      <Modal open={!!investigateData || investigateLoading} onClose={() => { setInvestigateData(null); setInvestigateLoading(false); }} title={`Task History: ${investigateData?.taskName ?? ''}`} maxWidth="max-w-2xl">
        {investigateLoading ? <PageLoader /> : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {investigateData?.history.length === 0 ? <EmptyState title="No history recorded for this task" /> : investigateData?.history.map((h) => (
              <div key={h.id} className="flex items-start gap-3 rounded-lg border border-[#edf1f6] p-3">
                <div className="flex-1">
                  <p className="text-sm text-[#17243d]"><span className="font-medium">{h.field_name.replace(/_/g, ' ')}</span>: {h.old_value ?? '—'} → {h.new_value ?? '—'}</p>
                  <p className="text-xs text-[#5a6c84]">{h.action} · {formatDateTime(h.changed_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

// --- Risk helpers ---
function riskWeight(r: RiskLevel): number { return r === 'high' ? 3 : r === 'medium' ? 2 : 1; }
function riskBadge(r: RiskLevel): string {
  return r === 'high' ? 'bg-rose-100 text-rose-700' : r === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700';
}
function RiskIcon({ level }: { level: RiskLevel }) {
  return (
    <div className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${level === 'high' ? 'bg-rose-100' : level === 'medium' ? 'bg-amber-100' : 'bg-sky-100'}`}>
      {level === 'high' ? <XCircle className="h-4 w-4 text-rose-600" /> : level === 'medium' ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <Info className="h-4 w-4 text-sky-600" />}
    </div>
  );
}
function RiskPill({ level, count }: { level: RiskLevel; count: number }) {
  const colors = { high: 'bg-rose-50 text-rose-700 border-rose-200', medium: 'bg-amber-50 text-amber-700 border-amber-200', info: 'bg-sky-50 text-sky-700 border-sky-200' };
  const labels = { high: 'High', medium: 'Medium', info: 'Info' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${colors[level]}`}>
      {labels[level]}: {count}
    </span>
  );
}

// --- Anomaly detection algorithms ---
function detectAnomalies(tasks: Task[], history: TaskHistory[], today: string): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const now = new Date().toISOString();

  // Filter out master/admin tasks
  const nonMasterTasks = tasks.filter((t) => {
    const email = (t.team_member as unknown as TeamMember | null)?.email?.toLowerCase();
    return !email || !MASTER_EMAILS.has(email);
  });

  // Group task history by task_id
  const historyByTask = new Map<string, TaskHistory[]>();
  for (const h of history) {
    const arr = historyByTask.get(h.task_id) ?? [];
    arr.push(h);
    historyByTask.set(h.task_id, arr);
  }

  // Group tasks by team_member_id for per-employee analysis
  const tasksByMember = new Map<string, Task[]>();
  for (const t of nonMasterTasks) {
    if (!t.team_member_id) continue;
    const arr = tasksByMember.get(t.team_member_id) ?? [];
    arr.push(t);
    tasksByMember.set(t.team_member_id, arr);
  }

  // Group task creation counts by day for the whole CRM
  const tasksByDate = new Map<string, Task[]>();
  for (const t of nonMasterTasks) {
    const day = (t.created_at ?? '').slice(0, 10);
    if (!day) continue;
    const arr = tasksByDate.get(day) ?? [];
    arr.push(t);
    tasksByDate.set(day, arr);
  }

  // Group task creation by member and day
  const memberTasksByDate = new Map<string, Map<string, Task[]>>();
  for (const t of nonMasterTasks) {
    if (!t.team_member_id) continue;
    const day = (t.created_at ?? '').slice(0, 10);
    if (!day) continue;
    const memberMap = memberTasksByDate.get(t.team_member_id) ?? new Map<string, Task[]>();
    const arr = memberMap.get(day) ?? [];
    arr.push(t);
    memberMap.set(day, arr);
    memberTasksByDate.set(t.team_member_id, memberMap);
  }

  // 1. Detect rapid status oscillation (back-and-forth on same task)
  for (const [taskId, hist] of historyByTask) {
    const statusChanges = hist.filter((h) => h.field_name === 'status').sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());
    if (statusChanges.length < 4) continue;

    // Count status reversions (old_value == new_value of a later change within 24h)
    let reversions = 0;
    let recentReversions = 0;
    for (let i = 0; i < statusChanges.length; i++) {
      for (let j = i + 2; j < statusChanges.length; j++) {
        if (statusChanges[i].new_value === statusChanges[j].new_value && hoursBetween(statusChanges[i].changed_at, statusChanges[j].changed_at) <= 24) {
          reversions++;
          if (hoursBetween(statusChanges[j].changed_at, now) <= 24) recentReversions++;
        }
      }
    }

    if (reversions >= 2) {
      const task = tasks.find((t) => t.id === taskId);
      const taskName = task?.name ?? 'Unknown task';
      const employee = task?.team_member?.name ?? null;
      const firstChange = statusChanges[0].changed_at;
      const lastChange = statusChanges[statusChanges.length - 1].changed_at;
      const risk: RiskLevel = recentReversions >= 3 ? 'high' : 'medium';
      anomalies.push({
        key: `status_oscillation_${taskId}`,
        type: 'repeated_status_changes',
        employee, taskName, taskId: task?.id ?? null,
        description: `Task "${taskName}" has ${reversions} status reversion(s) — the same status was set back to a previous value multiple times.`,
        why: `Status changed ${statusChanges.length} times with ${reversions} reversion(s) to a prior status within 24-hour windows. Normal CRM workflow typically moves forward without frequent reversions.`,
        evidence: `Status change sequence: ${statusChanges.map((s) => `${s.old_value ?? 'null'}→${s.new_value}`).join(', ')}. ${recentReversions} reversion(s) in the last 24 hours.`,
        risk, firstDetected: firstChange, lastDetected: lastChange,
      });
    }
  }

  // 2. Detect unusually high number of status changes on a single task in a short period
  for (const [taskId, hist] of historyByTask) {
    const statusChanges = hist.filter((h) => h.field_name === 'status').sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());
    if (statusChanges.length < 5) continue;

    // Check if 5+ status changes happened within 1 hour
    for (let i = 0; i <= statusChanges.length - 5; i++) {
      const window = statusChanges.slice(i, i + 5);
      const span = hoursBetween(window[0].changed_at, window[4].changed_at);
      if (span <= 1) {
        const task = tasks.find((t) => t.id === taskId);
        const taskName = task?.name ?? 'Unknown task';
        const employee = task?.team_member?.name ?? null;
        anomalies.push({
          key: `rapid_status_burst_${taskId}`,
          type: 'rapid_status_changes',
          employee, taskName, taskId: task?.id ?? null,
          description: `Task "${taskName}" had 5+ status changes within 1 hour.`,
          why: 'A burst of 5 or more status changes within a single hour is unusual compared to normal task progression.',
          evidence: `5 changes between ${formatDateTime(window[0].changed_at)} and ${formatDateTime(window[4].changed_at)} (${Math.round(span * 60)} min span).`,
          risk: 'high', firstDetected: window[0].changed_at, lastDetected: window[4].changed_at,
        });
        break; // Only one anomaly per task for this type
      }
    }
  }

  // 3. Detect unusual spike in task creation for an employee compared to their own history
  for (const [memberId, dayMap] of memberTasksByDate) {
    const dailyCounts = Array.from(dayMap.entries()).map(([day, arr]) => ({ day, count: arr.length }));
    if (dailyCounts.length < 7) continue; // Need at least 7 days of history

    const todayCount = dayMap.get(today)?.length ?? 0;
    const historicalCounts = dailyCounts.filter((d) => d.day !== today).map((d) => d.count);
    if (historicalCounts.length < 5) continue;

    const avg = historicalCounts.reduce((s, c) => s + c, 0) / historicalCounts.length;
    const maxHistorical = Math.max(...historicalCounts);

    if (todayCount > 0 && todayCount > avg * 3 && todayCount > maxHistorical + 2) {
      const memberTasks = tasksByMember.get(memberId) ?? [];
      const member = memberTasks[0]?.team_member?.name ?? 'Unknown';
      anomalies.push({
        key: `creation_spike_${memberId}_${today}`,
        type: 'unusual_task_creation_spike',
        employee: member, taskName: null, taskId: null,
        description: `${member} had ${todayCount} task(s) created today, which is significantly higher than their daily average of ${avg.toFixed(1)}.`,
        why: `Today's task creation count (${todayCount}) is more than 3x their historical daily average (${avg.toFixed(1)}) and exceeds their previous maximum (${maxHistorical}).`,
        evidence: `Historical daily counts: ${historicalCounts.join(', ')}. Today: ${todayCount}. Baseline: ${historicalCounts.length} days of data.`,
        risk: 'medium', firstDetected: now, lastDetected: now,
      });
    }

    // Detect unusual drop to zero when they normally have tasks
    if (todayCount === 0 && avg >= 2) {
      const workingDaysWithData = historicalCounts.filter((c) => c > 0).length;
      if (workingDaysWithData >= 5) {
        const mt = tasksByMember.get(memberId) ?? [];
        const member = mt[0]?.team_member?.name ?? 'Unknown';
        anomalies.push({
          key: `creation_drop_${memberId}_${today}`,
          type: 'unusual_task_creation_drop',
          employee: member, taskName: null, taskId: null,
          description: `${member} has no tasks created today, which is unusual given their average of ${avg.toFixed(1)} tasks/day.`,
          why: `This employee typically has ${avg.toFixed(1)} tasks created per day. Zero tasks today may indicate inactivity or a workflow change.`,
          evidence: `Historical daily counts: ${historicalCounts.join(', ')}. Average: ${avg.toFixed(1)}. Today: 0.`,
          risk: 'info', firstDetected: now, lastDetected: now,
        });
      }
    }
  }

  // 4. Detect unusual number of "Not Approved" (Changes Required) for an employee
  for (const [memberId, memberTasks] of tasksByMember) {
    const notApproved = memberTasks.filter((t) => t.status === 'not_approved');
    if (notApproved.length < 3) continue;

    // Count not_approved status changes in history for this member's tasks
    const memberTaskIds = new Set(memberTasks.map((t) => t.id));
    const notApprovedChanges = history.filter((h) => h.field_name === 'status' && h.new_value === 'not_approved' && memberTaskIds.has(h.task_id));

    // Calculate rate: not_approved changes vs total status changes
    const totalStatusChanges = history.filter((h) => h.field_name === 'status' && memberTaskIds.has(h.task_id)).length;
    if (totalStatusChanges < 5) continue;

    const rate = notApprovedChanges.length / totalStatusChanges;
    if (rate > 0.4 && notApprovedChanges.length >= 3) {
      const member = memberTasks[0]?.team_member?.name ?? 'Unknown';
      const taskNames = notApproved.slice(0, 5).map((t) => t.name).join(', ');
      anomalies.push({
        key: `high_changes_required_${memberId}`,
        type: 'unusual_changes_required_rate',
        employee: member, taskName: null, taskId: null,
        description: `${member} has a high rate of "Not Approved" status changes (${notApprovedChanges.length} out of ${totalStatusChanges} total status changes, ${(rate * 100).toFixed(0)}%).`,
        why: `This employee's tasks are being sent back for changes at a rate of ${(rate * 100).toFixed(0)}%, which is above the 40% threshold. This may indicate a quality issue or a mismatch in expectations.`,
        evidence: `Currently ${notApproved.length} task(s) in "Not Approved" status: ${taskNames}. Rate based on ${totalStatusChanges} total status changes.`,
        risk: notApprovedChanges.length >= 5 ? 'high' : 'medium',
        firstDetected: notApprovedChanges[0]?.changed_at ?? now, lastDetected: notApprovedChanges[notApprovedChanges.length - 1]?.changed_at ?? now,
      });
    }
  }

  // 5. Detect bulk changes — many tasks updated by the same person in a short window
  const changesByUser = new Map<string, TaskHistory[]>();
  for (const h of history) {
    if (!h.changed_by) continue;
    const arr = changesByUser.get(h.changed_by) ?? [];
    arr.push(h);
    changesByUser.set(h.changed_by, arr);
  }

  for (const [userId, userChanges] of changesByUser) {
    const sorted = userChanges.sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());
    for (let i = 0; i <= sorted.length - 10; i++) {
      const window = sorted.slice(i, i + 10);
      const span = hoursBetween(window[0].changed_at, window[9].changed_at);
      if (span <= 0.5) { // 10+ changes within 30 minutes
        // Get employee name from profile
        const uniqueTasks = new Set(window.map((w) => w.task_id));
        if (uniqueTasks.size >= 5) { // affecting 5+ different tasks
          anomalies.push({
            key: `bulk_changes_${userId}_${window[0].changed_at}`,
            type: 'unusual_bulk_changes',
            employee: null, taskName: null, taskId: null,
            description: `A user made ${window.length} changes across ${uniqueTasks.size} different tasks within 30 minutes.`,
            why: 'A high volume of changes across many different tasks in a very short time window may indicate a bulk operation or automated process.',
            evidence: `${window.length} changes between ${formatDateTime(window[0].changed_at)} and ${formatDateTime(window[9].changed_at)} (${Math.round(span * 60)} min), affecting ${uniqueTasks.size} tasks.`,
            risk: 'medium', firstDetected: window[0].changed_at, lastDetected: window[9].changed_at,
          });
          break;
        }
      }
    }
  }

  // 6. Detect task stuck in the same status for an unusually long time
  for (const [taskId, hist] of historyByTask) {
    const statusChanges = hist.filter((h) => h.field_name === 'status').sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());
    if (statusChanges.length === 0) continue;

    const lastChange = statusChanges[statusChanges.length - 1];
    const currentStatus: string = lastChange.new_value ?? '';
    const hoursInStatus = (Date.now() - new Date(lastChange.changed_at).getTime()) / 3600000;

    // Unusual if stuck in a transitional status for 24+ hours
    const transitionalStatuses = ['in_progress', 'in_approval', 'started'];
    if (currentStatus && transitionalStatuses.includes(currentStatus) && hoursInStatus >= 24) {
      const task = tasks.find((t) => t.id === taskId);
      const taskName = task?.name ?? 'Unknown task';
      const employee = task?.team_member?.name ?? null;

      // Check how long this employee's tasks typically stay in this status
      const memberTaskIds = task?.team_member_id ? new Set((tasksByMember.get(task.team_member_id) ?? []).map((t) => t.id)) : null;
      const memberStatusChanges = memberTaskIds ? history.filter((h) => h.field_name === 'status' && memberTaskIds.has(h.task_id)) : [];
      const sameStatusDurations: number[] = [];
      for (let i = 0; i < memberStatusChanges.length - 1; i++) {
        if (memberStatusChanges[i].new_value === currentStatus) {
          const nextChange = memberStatusChanges.slice(i + 1).find((h) => h.task_id === memberStatusChanges[i].task_id && h.field_name === 'status');
          if (nextChange) {
            sameStatusDurations.push(hoursBetween(memberStatusChanges[i].changed_at, nextChange.changed_at));
          }
        }
      }

      let why: string;
      let evidence: string;
      let risk: RiskLevel;

      if (sameStatusDurations.length >= 3) {
        const avgDuration = sameStatusDurations.reduce((s, d) => s + d, 0) / sameStatusDurations.length;
        const ratio = hoursInStatus / avgDuration;
        if (ratio > 2) {
          why = `This task has been in "${currentStatus.replace(/_/g, ' ')}" for ${Math.round(hoursInStatus)}h, which is ${ratio.toFixed(1)}x longer than this employee's average of ${avgDuration.toFixed(1)}h for this status.`;
          evidence = `Employee's historical durations in "${currentStatus.replace(/_/g, ' ')}": ${sameStatusDurations.map((d) => d.toFixed(1) + 'h').join(', ')}. Current: ${hoursInStatus.toFixed(1)}h.`;
          risk = hoursInStatus >= 48 ? 'high' : 'medium';
        } else {
          continue; // Not unusual enough
        }
      } else {
        // Insufficient data for comparison
        why = `This task has been in "${currentStatus.replace(/_/g, ' ')}" for ${Math.round(hoursInStatus)} hours, which is unusually long for a transitional status.`;
        evidence = `Insufficient historical data to compare against this employee's typical duration. Only ${sameStatusDurations.length} prior transition(s) recorded.`;
        risk = 'info';
      }

      anomalies.push({
        key: `stuck_status_${taskId}`,
        type: 'task_stuck_in_status',
        employee, taskName, taskId: task?.id ?? null,
        description: `Task "${taskName}" has been in "${currentStatus.replace(/_/g, ' ')}" status for ${Math.round(hoursInStatus)} hours.`,
        why, evidence, risk,
        firstDetected: lastChange.changed_at, lastDetected: now,
      });
    }
  }

  // 7. Detect unusual task completion pattern — sudden burst of approvals
  for (const [userId, userChanges] of changesByUser) {
    const approvals = userChanges.filter((h) => h.field_name === 'status' && h.new_value === 'approved').sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());
    if (approvals.length < 5) continue;

    for (let i = 0; i <= approvals.length - 5; i++) {
      const window = approvals.slice(i, i + 5);
      const span = hoursBetween(window[0].changed_at, window[4].changed_at);
      if (span <= 1) {
        const uniqueTasks = new Set(window.map((w) => w.task_id));
        anomalies.push({
          key: `approval_burst_${userId}_${window[0].changed_at}`,
          type: 'unusual_approval_burst',
          employee: null, taskName: null, taskId: null,
          description: `5+ tasks were approved within 1 hour by the same user.`,
          why: 'A sudden burst of task approvals in a short period may indicate bulk approvals or an unusual review pattern.',
          evidence: `5 approvals between ${formatDateTime(window[0].changed_at)} and ${formatDateTime(window[4].changed_at)} (${Math.round(span * 60)} min), covering ${uniqueTasks.size} task(s).`,
          risk: 'info', firstDetected: window[0].changed_at, lastDetected: window[4].changed_at,
        });
        break;
      }
    }
  }

  // 8. Detect unusual out-of-order status progression
  const statusOrder: Record<string, number> = { not_started: 0, started: 1, in_progress: 2, in_approval: 3, approved: 4, not_approved: 3 };
  for (const [taskId, hist] of historyByTask) {
    const statusChanges = hist.filter((h) => h.field_name === 'status').sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());
    if (statusChanges.length < 3) continue;

    let backwardJumps = 0;
    for (let i = 1; i < statusChanges.length; i++) {
      const prevOrder = statusOrder[statusChanges[i].old_value ?? ''] ?? 0;
      const currOrder = statusOrder[statusChanges[i].new_value ?? ''] ?? 0;
      if (currOrder < prevOrder - 1) { // More than 1 step backward
        backwardJumps++;
      }
    }

    if (backwardJumps >= 2) {
      const task = tasks.find((t) => t.id === taskId);
      const taskName = task?.name ?? 'Unknown task';
      const employee = task?.team_member?.name ?? null;
      anomalies.push({
        key: `out_of_order_${taskId}`,
        type: 'unusual_status_progression',
        employee, taskName, taskId: task?.id ?? null,
        description: `Task "${taskName}" had ${backwardJumps} backward status jump(s) that skip stages in the normal workflow.`,
        why: 'Tasks normally progress forward through statuses. Multiple backward jumps that skip stages may indicate confusion or an unusual workflow pattern.',
        evidence: `Status sequence: ${statusChanges.map((s) => `${s.old_value ?? 'null'}→${s.new_value}`).join(', ')}. ${backwardJumps} backward jump(s) detected.`,
        risk: 'info', firstDetected: statusChanges[0].changed_at, lastDetected: statusChanges[statusChanges.length - 1].changed_at,
      });
    }
  }

  return anomalies;
}
