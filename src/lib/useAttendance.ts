import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { AttendanceRecord, TeamMember } from './types';

const KAPIL_EMAIL = 'kapilprajapati9054@gmail.com';

function istDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export function useAttendance(scope?: { teamMemberId?: string | null; fromDate?: string; toDate?: string }) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    let q = supabase
      .from('attendance_records')
      .select('*, team_member:team_members(*)')
      .order('attendance_date', { ascending: false });

    if (scope?.teamMemberId) q = q.eq('team_member_id', scope.teamMemberId);
    if (scope?.fromDate) q = q.gte('attendance_date', scope.fromDate);
    if (scope?.toDate) q = q.lte('attendance_date', scope.toDate);

    const { data } = await q;
    if (data) setRecords(data as AttendanceRecord[]);
    setLoading(false);
  }, [scope?.teamMemberId, scope?.fromDate, scope?.toDate]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('attendance-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return { records, loading, reload: load };
}

export function useMyTodayAttendance(teamMemberId: string | null | undefined) {
  const today = istDate();
  const { records, loading, reload } = useAttendance({ teamMemberId, fromDate: today, toDate: today });
  const myRecord = records.find((r) => r.attendance_date === today);
  return { myRecord, loading, reload };
}

export type MemberTaskCount = { member: TeamMember; taskCount: number };

export function useTaskCounts(date: string, members: TeamMember[]) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (members.length === 0) {
      setCounts({});
      setLoading(false);
      return;
    }
    const memberIds = members.map((m) => m.id);
    const { data, error } = await supabase
      .from('tasks')
      .select('team_member_id')
      .eq('due_date', date)
      .in('team_member_id', memberIds);
    if (error) {
      setCounts({});
      setLoading(false);
      return;
    }
    // Group members by email so a person with multiple team_member rows
    // (one per workspace) gets an aggregated task count across all rows.
    const idsByEmail = new Map<string, string[]>();
    for (const m of members) {
      const key = (m.email ?? m.id).toLowerCase();
      if (!idsByEmail.has(key)) idsByEmail.set(key, []);
      idsByEmail.get(key)!.push(m.id);
    }
    const tally: Record<string, number> = {};
    for (const m of memberIds) tally[m] = 0;
    for (const row of data ?? []) {
      const id = row.team_member_id as string;
      if (id) tally[id] = (tally[id] ?? 0) + 1;
    }
    // For each email group, set every member's count to the group total
    for (const [, ids] of idsByEmail) {
      const groupTotal = ids.reduce((sum, id) => sum + (tally[id] ?? 0), 0);
      for (const id of ids) tally[id] = groupTotal;
    }
    setCounts(tally);
    setLoading(false);
  }, [date, members]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('task-counts-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return { counts, loading, reload: load };
}

export { KAPIL_EMAIL, istDate };
