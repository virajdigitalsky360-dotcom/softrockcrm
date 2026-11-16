import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import type { Task, Client, TeamMember, Workspace, TaskNote, Leave, LeaveEmailLog } from './types';

const taskSelect = '*, client:clients(*), team_member:team_members(*, workspace:workspaces(*)), workspace:workspaces(*)';

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('workspaces').select('*').order('name');
    if (!error && data) setWorkspaces(data as Workspace[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('workspaces-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspaces' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return { workspaces, loading, reload: load };
}

export function useTeamMembers() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('team_members')
      .select('*, workspace:workspaces(*)')
      .order('name');
    if (!error && data) setMembers(data as TeamMember[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('members-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return { members, loading, reload: load };
}

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('clients').select('*').order('name');
    if (!error && data) setClients(data as Client[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('clients-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return { clients, loading, reload: load };
}

export function useTasks(filters?: {
  workspaceId?: string | null;
  teamMemberId?: string | null;
  clientId?: string | null;
  status?: string | null;
  dueDate?: string | null; // 'today' | 'overdue' | 'all' | ISO date
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    let q = supabase.from('tasks').select(taskSelect);
    if (filters?.workspaceId) q = q.eq('workspace_id', filters.workspaceId);
    if (filters?.teamMemberId) q = q.eq('team_member_id', filters.teamMemberId);
    if (filters?.clientId) q = q.eq('client_id', filters.clientId);
    if (filters?.status && filters.status !== 'all') q = q.eq('status', filters.status);
    if (filters?.dueDate) {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      if (filters.dueDate === 'today') q = q.eq('due_date', todayStr);
      else if (filters.dueDate === 'overdue') q = q.lt('due_date', todayStr);
      else q = q.eq('due_date', filters.dueDate);
    }
    q = q.order('created_at', { ascending: false });
    const { data, error } = await q;
    if (!error && data) setTasks(data as Task[]);
    setLoading(false);
  }, [filters?.workspaceId, filters?.teamMemberId, filters?.clientId, filters?.status, filters?.dueDate]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('tasks-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  return { tasks, loading, reload: load };
}

export function useTaskNotes(taskId: string | null) {
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!taskId) { setNotes([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('task_notes')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    if (!error && data) setNotes(data as TaskNote[]);
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    load();
    if (!taskId) return;
    const ch = supabase
      .channel(`notes-rt-${taskId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_notes', filter: `task_id=eq.${taskId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, taskId]);

  return { notes, loading, reload: load };
}

export function useLeaves(scope?: { userId?: string | null }) {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    let q = supabase.from('leaves').select('*');
    if (scope?.userId) q = q.eq('user_id', scope.userId);
    q = q.order('created_at', { ascending: false });
    const { data, error } = await q;
    if (!error && data) setLeaves(data as Leave[]);
    setLoading(false);
  }, [scope?.userId]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('leaves-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leaves' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return { leaves, loading, reload: load };
}

export function useLeaveEmailLogs(leaveId: string | null) {
  const [logs, setLogs] = useState<LeaveEmailLog[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!leaveId) { setLogs([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('leave_email_logs')
      .select('*')
      .eq('leave_id', leaveId)
      .order('created_at', { ascending: false });
    if (!error && data) setLogs(data as LeaveEmailLog[]);
    setLoading(false);
  }, [leaveId]);

  useEffect(() => {
    load();
    if (!leaveId) return;
    const ch = supabase
      .channel(`leave-email-logs-rt-${leaveId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_email_logs', filter: `leave_id=eq.${leaveId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, leaveId]);

  return { logs, loading, reload: load };
}
