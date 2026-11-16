import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

const INACTIVITY_MS = 3 * 60 * 60 * 1000; // 3 hours
const CHECK_INTERVAL_MS = 60 * 1000; // check every minute

// Active statuses that should be monitored for inactivity.
// Excludes in_approval and approved per requirements.
const ACTIVE_STATUSES = ['not_started', 'started', 'in_progress', 'changes_required', 'not_approved'];

const ROSTAN_EMAIL = 'softrockind@gmail.com';
const KAPIL_EMAIL = 'kapilprajapati9054@gmail.com';
const VIRAJ_EMAIL = 'viraj.digitalsky360@gmail.com';

export type NotifPerm = NotificationPermission | 'unsupported';

function indiaDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    not_started: 'Not Started',
    started: 'Started',
    in_progress: 'In Progress',
    in_approval: 'In Approval',
    changes_required: 'Changes Required',
    not_approved: 'Not Approved',
  };
  return labels[status] ?? status;
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const mins = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours >= 1) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

interface TaskWithMember {
  id: string;
  name: string;
  status: string;
  updated_at: string;
  due_date: string | null;
  notes: string | null;
  client?: { name: string } | null;
  team_member?: { id: string; name: string; email: string | null } | null;
  workspace?: { name: string } | null;
}

interface DispatchRow {
  recipient_email: string;
  notification_type: string;
  title: string;
  body: string;
  task_id: string;
  notification_key: string;
}

export function useInactivityNotifications() {
  const { profile, session, user } = useAuth();
  const teamMemberId = profile?.team_member_id ?? null;
  const userEmail = (user?.email ?? '').toLowerCase();
  const isMaster = profile?.role === 'master';

  const dispatchedRef = useRef<Set<string>>(new Set());
  const [perm, setPerm] = useState<NotifPerm>('default');

  const refreshPerm = useCallback(() => {
    if (!('Notification' in window)) {
      setPerm('unsupported');
      return;
    }
    setPerm(Notification.permission);
  }, []);

  // Auto-request notification permission on first user interaction for all logged-in users
  useEffect(() => {
    if (!session) return;
    if (!('Notification' in window)) {
      setPerm('unsupported');
      return;
    }
    setPerm(Notification.permission);

    if (Notification.permission !== 'default') return;

    let triggered = false;
    const onFirstInteraction = async () => {
      if (triggered) return;
      triggered = true;
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission();
        setPerm(result);
      }
      cleanup();
    };

    const cleanup = () => {
      document.removeEventListener('click', onFirstInteraction);
      document.removeEventListener('keydown', onFirstInteraction);
      document.removeEventListener('touchstart', onFirstInteraction);
    };

    document.addEventListener('click', onFirstInteraction, { once: false });
    document.addEventListener('keydown', onFirstInteraction, { once: false });
    document.addEventListener('touchstart', onFirstInteraction, { once: false });

    return cleanup;
  }, [session]);

  // Realtime listener: fires a local Notification when a dispatch row targets this user
  useEffect(() => {
    if (!session || !userEmail) return;
    if (!('Notification' in window)) return;

    const channel = supabase
      .channel('desktop-notifications-receiver')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'desktop_notifications' },
        (payload) => {
          const row = payload.new as {
            id: string;
            recipient_email: string;
            title: string;
            body: string;
            notification_type: string;
            task_id: string | null;
          };
          if (row.recipient_email.toLowerCase() !== userEmail) return;
          if (Notification.permission !== 'granted') return;
          try {
            new Notification(row.title, {
              body: row.body,
              icon: '/ICON.jpg',
              tag: `dn-${row.id}`,
            });
          } catch {
            // ignore
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, userEmail]);

  // Inactivity checker: any logged-in user's browser checks all today's tasks.
  // Only master browsers run the dispatch to avoid every browser writing duplicates.
  useEffect(() => {
    if (!session || !isMaster) return;

    let cancelled = false;

    async function checkInactivity() {
      if (cancelled) return;
      if (!('Notification' in window)) return;

      const todayIST = indiaDate();

      // Skip inactivity monitoring on Sundays and office holidays
      const todayDateObj = new Date(todayIST + 'T12:00:00+05:30');
      if (todayDateObj.getDay() === 0) return;
      const { data: holidayRow } = await supabase
        .from('office_holidays')
        .select('id')
        .eq('holiday_date', todayIST)
        .eq('is_active', true)
        .maybeSingle();
      if (holidayRow) return;

      const { data, error } = await supabase
        .from('tasks')
        .select('*, client:clients(name), team_member:team_members(id, name, email), workspace:workspaces(name)')
        .eq('due_date', todayIST)
        .in('status', ACTIVE_STATUSES);

      if (error || !data) return;

      const now = Date.now();
      const tasks = data as TaskWithMember[];
      const dispatchRows: DispatchRow[] = [];

      for (const task of tasks) {
        // Skip Viraj's tasks — he's Primary Master, excluded from inactivity monitoring
        if (task.team_member?.email?.toLowerCase() === VIRAJ_EMAIL) continue;

        const updatedAt = new Date(task.updated_at).getTime();
        const inactiveMs = now - updatedAt;
        if (inactiveMs < INACTIVITY_MS) continue;

        // Dedup key: task + updated_at timestamp.
        // When the task is meaningfully updated, updated_at changes → new key → new alert allowed.
        const baseKey = `${task.id}-${task.updated_at}`;
        if (dispatchedRef.current.has(baseKey)) continue;

        const ownerEmail = task.team_member?.email;
        const ownerName = task.team_member?.name ?? 'Unassigned';
        const clientName = task.client?.name ?? 'No client';
        const status = statusLabel(task.status);
        const duration = formatDuration(inactiveMs);
        const inactiveSince = new Date(updatedAt).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        // 1. Task Owner notification — "Please update your task"
        if (ownerEmail) {
          dispatchRows.push({
            recipient_email: ownerEmail,
            notification_type: 'task_owner_reminder',
            title: 'Task Update Reminder',
            body: `Please update your task in the CRM: ${task.name}`,
            task_id: task.id,
            notification_key: `owner-${baseKey}`,
          });
        }

        // 2. Team Monitor notification to Kapil — "Employee has not updated the task"
        dispatchRows.push({
          recipient_email: KAPIL_EMAIL,
          notification_type: 'team_monitor_alert',
          title: 'Team Task Update Alert',
          body: `${ownerName} has not updated the task.\nTask: ${task.name}\nClient: ${clientName}\nStatus: ${status}\nInactive since: ${inactiveSince}\nInactivity duration: ${duration}`,
          task_id: task.id,
          notification_key: `kapil-${baseKey}`,
        });

        // 3. Team Monitor notification to Rostan — same alert
        // For Rostan's own tasks: Rostan gets the owner reminder, not a duplicate team alert.
        if (ownerEmail?.toLowerCase() !== ROSTAN_EMAIL) {
          dispatchRows.push({
            recipient_email: ROSTAN_EMAIL,
            notification_type: 'team_monitor_alert',
            title: 'Team Task Update Alert',
            body: `${ownerName} has not updated the task.\nTask: ${task.name}\nClient: ${clientName}\nStatus: ${status}\nInactive since: ${inactiveSince}\nInactivity duration: ${duration}`,
            task_id: task.id,
            notification_key: `rostan-${baseKey}`,
          });
        }

        dispatchedRef.current.add(baseKey);
      }

      if (dispatchRows.length === 0) return;

      // Insert dispatch rows — unique constraint on notification_key prevents duplicates
      // even if multiple master browsers run simultaneously.
      await supabase
        .from('desktop_notifications')
        .insert(dispatchRows.map((r) => ({
          recipient_email: r.recipient_email,
          notification_type: r.notification_type,
          title: r.title,
          body: r.body,
          task_id: r.task_id,
          notification_key: r.notification_key,
        })));
    }

    checkInactivity();
    const interval = setInterval(checkInactivity, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session, isMaster]);

  // Clear dispatched cache on user switch
  useEffect(() => {
    dispatchedRef.current.clear();
  }, [teamMemberId]);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setPerm(result);
  }, []);

  return { perm, requestPermission, refreshPerm };
}
