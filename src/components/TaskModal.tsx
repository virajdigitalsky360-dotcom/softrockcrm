import { useEffect, useState, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Task, Client, TeamMember, Workspace, TaskStatus, TaskHistory } from '@/lib/types';
import { Modal, Button, Input, Select, Textarea } from './ui';
import ClientSelect from './ClientSelect';
import { Trash2, Save, History, User as UserIcon, Clock } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  task: Task | null;            // null = create
  clients: Client[];
  members: TeamMember[];
  workspaces: Workspace[];
  defaultWorkspaceId?: string | null;
  onSaved: () => void;
}

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'started', label: 'Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_approval', label: 'In Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'not_approved', label: 'Not Approved' },
];

const FIELD_LABELS: Record<string, string> = {
  name: 'Task Name',
  client_id: 'Client',
  team_member_id: 'Assigned Person',
  workspace_id: 'Workspace',
  due_date: 'Due Date',
  due_time: 'Due Time',
  status: 'Status',
  notes: 'Notes',
};

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  started: 'Started',
  in_progress: 'In Progress',
  in_approval: 'In Approval',
  approved: 'Approved',
  not_approved: 'Not Approved',
};

function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatHistoryValue(field: string, value: string | null): string {
  if (value === null || value === undefined) return '—';
  if (field === 'status') return STATUS_LABELS[value] ?? value;
  return value;
}

function formatHistoryDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TaskModal({ open, onClose, task, clients, members, workspaces, defaultWorkspaceId, onSaved }: Props) {
  const { user, canDeleteTask } = useAuth();
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [dueDate, setDueDate] = useState('');

  const [status, setStatus] = useState<TaskStatus>('not_started');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<TaskHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [creatorName, setCreatorName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (task) {
      setName(task.name);
      setClientId(task.client_id ?? '');
      setMemberId(task.team_member_id ?? '');
      setWorkspaceId(task.workspace_id ?? '');
      setDueDate(task.due_date ?? '');
      setStatus(task.status);
      setNotes(task.notes ?? '');
      loadHistory(task.id);
      loadCreator(task.created_by);
    } else {
      setName('');
      setClientId('');
      setMemberId('');
      setWorkspaceId(defaultWorkspaceId ?? '');
      setDueDate(istToday());
      setStatus('not_started');
      setNotes('');
      setHistory([]);
      setCreatorName(null);
      setShowHistory(false);
    }
    setError(null);
  }, [open, task, defaultWorkspaceId]);

  async function loadHistory(taskId: string) {
    setHistoryLoading(true);
    const { data } = await supabase
      .from('task_history')
      .select('*')
      .eq('task_id', taskId)
      .order('changed_at', { ascending: false });
    setHistory(data as TaskHistory[] ?? []);
    setHistoryLoading(false);
  }

  async function loadCreator(createdBy: string | null) {
    if (!createdBy) { setCreatorName(null); return; }
    const { data } = await supabase
      .from('profiles')
      .select('display_name, email')
      .eq('id', createdBy)
      .maybeSingle();
    setCreatorName(data?.display_name || data?.email || null);
  }

  const membersForWorkspace = workspaceId
    ? members.filter((m) => m.workspace_id === workspaceId)
    : members;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Task name is required'); return; }
    if (!workspaceId) { setError('Workspace is required'); return; }
    setBusy(true);
    setError(null);

    const payload = {
      name: name.trim(),
      client_id: clientId || null,
      team_member_id: memberId || null,
      workspace_id: workspaceId || null,
      due_date: dueDate || null,
      status,
      notes: notes.trim() || null,
    };

    let result;
    if (task) {
      result = await supabase.from('tasks').update(payload).eq('id', task.id).select().maybeSingle();
    } else {
      result = await supabase.from('tasks').insert({ ...payload, created_by: user?.id ?? null }).select().maybeSingle();
    }

    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    onSaved();
    onClose();
  }

  async function remove() {
    if (!task) return;
    if (!confirm('Delete this task? This cannot be undone.')) return;
    setBusy(true);
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    setBusy(false);
    if (error) { setError(error.message); return; }
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={task ? 'Edit Task' : 'Add Task'} maxWidth="max-w-xl">
      <form onSubmit={save} className="space-y-4">
        <Input
          label="Task Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Doctor Reel Editing"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Workspace" value={workspaceId} onChange={(e) => { setWorkspaceId(e.target.value); setMemberId(''); }} required>
            <option value="">Select workspace</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </Select>

          <Select label="Assigned Person" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">Unassigned</option>
            {membersForWorkspace.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>

          <ClientSelect label="Client" clients={clients} value={clientId} onChange={setClientId} />

          <Input label="Due Date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />

          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </div>

        <Textarea label="Notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any extra details..." />

        {task && (
          <div className="rounded-lg border border-[#e5ebf3] bg-[#fbfcfe] px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-[#5a6c84]">
              <UserIcon className="h-3.5 w-3.5" />
              <span>Created by <span className="font-medium text-[#3d5070]">{creatorName ?? 'Unknown'}</span></span>
              <span className="text-[#c8d4e3]">·</span>
              <Clock className="h-3.5 w-3.5" />
              <span>{task.created_at ? formatHistoryDate(task.created_at) : '—'}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            {task && canDeleteTask ? (
              <Button variant="danger" size="sm" onClick={remove} disabled={busy}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            ) : null}
            {task && (
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)} type="button">
                <History className="h-3.5 w-3.5" /> History
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={busy}>
              <Save className="h-3.5 w-3.5" /> {busy ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>

        {task && showHistory && (
          <div className="rounded-xl border border-[#e5ebf3] bg-[#fbfcfe] p-4">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#17243d]">
              <History className="h-4 w-4 text-[#1478d4]" /> Task History
            </h4>
            {historyLoading ? (
              <p className="text-xs text-[#5a6c84]">Loading history...</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-[#5a6c84]">No changes recorded yet.</p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="rounded-lg border border-[#edf1f6] bg-white px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        h.action === 'created' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'
                      }`}>
                        {h.action === 'created' ? 'Created' : 'Updated'}
                      </span>
                      <span className="text-[10px] text-[#8a9bb5]">{formatHistoryDate(h.changed_at)}</span>
                    </div>
                    <p className="mt-1.5 text-xs text-[#3d5070]">
                      <span className="font-medium">{FIELD_LABELS[h.field_name] ?? h.field_name}</span>
                      {h.action === 'updated' && (
                        <>
                          : <span className="text-[#8a9bb5] line-through">{formatHistoryValue(h.field_name, h.old_value)}</span>
                          {' → '}
                          <span className="font-medium text-[#1478d4]">{formatHistoryValue(h.field_name, h.new_value)}</span>
                        </>
                      )}
                      {h.action === 'created' && (
                        <>: <span className="font-medium text-[#1478d4]">{formatHistoryValue(h.field_name, h.new_value)}</span></>
                      )}
                    </p>
                    {h.changed_by && (
                      <p className="mt-0.5 text-[10px] text-[#8a9bb5]">by user {h.changed_by.slice(0, 8)}...</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
