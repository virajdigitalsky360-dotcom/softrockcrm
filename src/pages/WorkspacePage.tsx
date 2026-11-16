import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useTasks, useClients, useTeamMembers, useWorkspaces } from '@/lib/hooks';
import type { Task, TeamMember } from '@/lib/types';
import { Card, StatusBadge, PageLoader, EmptyState, Button, Select, Input } from '@/components/ui';
import StatusSelect from '@/components/StatusSelect';
import TaskModal from '@/components/TaskModal';
import { Plus, Filter, Pencil, CalendarDays, User as UserIcon, Building2 } from 'lucide-react';

const VIDEO_EDITOR_SLUG = 'video-editor';

function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dueLabel(dateStr: string | null) {
  if (!dateStr) return 'No due date';
  const todayStr = istToday();
  if (dateStr === todayStr) return 'Today';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function WorkspacePage() {
  const { slug = '' } = useParams();
  const { isViewOnly, isMaster, profile } = useAuth();
  const { workspaces } = useWorkspaces();
  const { members } = useTeamMembers();
  const { clients } = useClients();

  const workspace = useMemo(() => workspaces.find((w) => w.slug === slug), [workspaces, slug]);

  const [fPerson, setFPerson] = useState('');

  const SOCIAL_MEDIA_SLUG = 'social-media';

  // Auto-filter to Rostan's own tasks when a non-master user opens Social Media
  useEffect(() => {
    if (slug === SOCIAL_MEDIA_SLUG && !isMaster && profile?.team_member_id) {
      setFPerson(profile.team_member_id);
    }
  }, [slug, isMaster, profile?.team_member_id]);
  const [fClient, setFClient] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fDate, setFDate] = useState(() => istToday());

  const { tasks, loading, reload } = useTasks({
    workspaceId: workspace?.id ?? null,
    teamMemberId: fPerson || null,
    clientId: fClient || null,
    status: fStatus || null,
    dueDate: fDate || null,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);

  const wsMembers = useMemo(() => members.filter((m) => m.workspace_id === workspace?.id), [members, workspace]);

  const isVideoEditor = workspace?.slug === VIDEO_EDITOR_SLUG;
  const isRostanLocked = slug === SOCIAL_MEDIA_SLUG && !isMaster;

  const videoEditorSections = useMemo(() => {
    const sectionOrder = ['viraj', 'bhagyoday', 'irfan'];
    const sorted = [...wsMembers].sort((a, b) => {
      const ai = sectionOrder.indexOf(a.name.toLowerCase());
      const bi = sectionOrder.indexOf(b.name.toLowerCase());
      if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return sorted.map((member) => ({
      member,
      tasks: tasks.filter((t) => t.team_member_id === member.id),
    }));
  }, [wsMembers, tasks]);

  if (!workspace && !loading) {
    return <EmptyState title="Workspace not found" />;
  }
  if (loading) return <PageLoader />;

  function openNew() { setEditTask(null); setModalOpen(true); }
  function openEdit(t: Task) { setEditTask(t); setModalOpen(true); }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#17243d]">{workspace?.name}</h1>
          <p className="text-sm text-[#5a6c84]">
            {wsMembers.map((m) => m.name).join(' · ') || 'No members assigned'}
          </p>
        </div>
        {!isViewOnly && (
          <Button onClick={openNew}><Plus className="h-4 w-4" /> Add Task</Button>
        )}
      </div>

      {/* filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Filter className="h-4 w-4 text-[#3d5070] self-center" />
          {!isRostanLocked && (
          <div className="min-w-[140px] flex-1">
            <Select value={fPerson} onChange={(e) => setFPerson(e.target.value)}>
              <option value="">All People</option>
              {wsMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </div>
          )}
          <div className="min-w-[140px] flex-1">
            <Select value={fClient} onChange={(e) => setFClient(e.target.value)}>
              <option value="">All Clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="min-w-[140px] flex-1">
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
      </Card>

      {isVideoEditor ? (
        <div className="space-y-8">
          {videoEditorSections.map(({ member, tasks: memberTasks }) => (
            <MemberSection
              key={member.id}
              title={`${member.name.toUpperCase()} TASKS`}
              member={member}
              tasks={memberTasks}
              isViewOnly={isViewOnly}
              onOpenEdit={openEdit}
            />
          ))}
        </div>
      ) : (
        <TaskGrid
          tasks={tasks}
          isViewOnly={isViewOnly}
          onOpenEdit={openEdit}
        />
      )}

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={editTask}
        clients={clients}
        members={members}
        workspaces={workspaces}
        defaultWorkspaceId={workspace?.id}
        onSaved={reload}
      />
    </div>
  );
}

function MemberSection({
  title,
  member,
  tasks,
  isViewOnly,
  onOpenEdit,
}: {
  title: string;
  member: TeamMember | undefined;
  tasks: Task[];
  isViewOnly: boolean;
  onOpenEdit: (t: Task) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-bold tracking-wide text-[#17243d]">{title}</h2>
        <span className="text-xs text-[#5a6c84]">({tasks.length})</span>
      </div>
      {!member ? (
        <Card><EmptyState title={`No team member named ${title.split(' ')[0]} found`} /></Card>
      ) : tasks.length === 0 ? (
        <Card><EmptyState title="No tasks assigned" /></Card>
      ) : (
        <TaskGrid tasks={tasks} isViewOnly={isViewOnly} onOpenEdit={onOpenEdit} />
      )}
    </div>
  );
}

function TaskGrid({
  tasks,
  isViewOnly,
  onOpenEdit,
}: {
  tasks: Task[];
  isViewOnly: boolean;
  onOpenEdit: (t: Task) => void;
}) {
  if (tasks.length === 0) {
    return <Card><EmptyState title="No tasks in this workspace" /></Card>;
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {tasks.map((t) => (
        <Card key={t.id} className="group p-4 transition-all duration-200 hover:-translate-y-1 hover:border-[#1478d4]/30 hover:shadow-lg hover:scale-[1.02]">
          <div className="mb-3 flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#17243d]">{t.name}</h3>
            {!isViewOnly && (
              <button onClick={() => onOpenEdit(t)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[#3d5070] opacity-0 transition-all duration-200 group-hover:opacity-100 hover:bg-[#eef5fc] hover:text-[#1478d4] hover:scale-110 active:scale-95">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="space-y-2 text-xs text-[#5a6c84]">
            <div className="flex items-center gap-2">
              <UserIcon className="h-3.5 w-3.5 text-[#3d5070]" />
              <span>{t.team_member?.name ?? 'Unassigned'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-[#3d5070]" />
              <span>{t.client?.name ?? 'No client'}</span>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-3.5 w-3.5 text-[#3d5070]" />
              <span>{dueLabel(t.due_date)}</span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-[#edf1f6] pt-3">
            {isViewOnly ? <StatusBadge status={t.status} /> : <StatusSelect task={t} />}
            <span className="text-[11px] text-[#3d5070]">
              {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}
