import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

const VIRAJ_EMAIL = 'viraj.digitalsky360@gmail.com';
const KAPIL_EMAIL = 'kapilprajapati9054@gmail.com';
const ROSTAN_EMAIL = 'softrockind@gmail.com';

/**
 * Desktop notification bridge.
 *
 * Two responsibilities:
 * 1. Realtime listener — every logged-in browser subscribes to desktop_notifications
 *    and fires a real browser Notification when recipient_email matches their user.
 * 2. Viraj's test button — simulates an inactive task and dispatches:
 *    - Task Owner notification to the selected task owner
 *    - Team Monitor notification to Kapil and Rostan
 *    No real tasks are created or modified. No email is sent.
 */
export function useTestNotification() {
  const { user, session } = useAuth();
  const userEmail = (user?.email ?? '').toLowerCase();
  const isViraj = userEmail === VIRAJ_EMAIL;
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Realtime listener: fire a local Notification when a dispatch row targets this user
  useEffect(() => {
    if (!session || !userEmail) return;
    if (!('Notification' in window)) return;

    // Auto-request permission on first interaction if not already granted
    if (Notification.permission === 'default') {
      let triggered = false;
      const onInteraction = async () => {
        if (triggered) return;
        triggered = true;
        if (Notification.permission === 'default') {
          await Notification.requestPermission();
        }
        document.removeEventListener('click', onInteraction);
        document.removeEventListener('keydown', onInteraction);
        document.removeEventListener('touchstart', onInteraction);
      };
      document.addEventListener('click', onInteraction, { once: false });
      document.addEventListener('keydown', onInteraction, { once: false });
      document.addEventListener('touchstart', onInteraction, { once: false });
    }

    const channel = supabase
      .channel('test-desktop-notif-receiver')
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

  // Viraj's test trigger: dispatch simulated notifications via desktop_notifications table
  const triggerTest = useCallback(async (taskName: string, ownerEmail: string, ownerName: string) => {
    if (!isViraj) return;
    setSending(true);
    setStatus(null);

    const testKey = `test-${Date.now()}`;
    const rows: Array<{
      recipient_email: string;
      notification_type: string;
      title: string;
      body: string;
      task_id: string | null;
      notification_key: string;
    }> = [];

    // Task Owner notification
    rows.push({
      recipient_email: ownerEmail,
      notification_type: 'task_owner_reminder',
      title: 'Task Update Reminder',
      body: `Please update your task in the CRM: ${taskName}`,
      task_id: null,
      notification_key: `test-owner-${testKey}`,
    });

    // Team Monitor notification to Kapil
    rows.push({
      recipient_email: KAPIL_EMAIL,
      notification_type: 'team_monitor_alert',
      title: 'Team Task Update Alert',
      body: `${ownerName} has not updated the task.\nTask: ${taskName}`,
      task_id: null,
      notification_key: `test-kapil-${testKey}`,
    });

    // Team Monitor notification to Rostan (skip if owner IS Rostan to avoid duplicate)
    if (ownerEmail.toLowerCase() !== ROSTAN_EMAIL) {
      rows.push({
        recipient_email: ROSTAN_EMAIL,
        notification_type: 'team_monitor_alert',
        title: 'Team Task Update Alert',
        body: `${ownerName} has not updated the task.\nTask: ${taskName}`,
        task_id: null,
        notification_key: `test-rostan-${testKey}`,
      });
    }

    const { error } = await supabase.from('desktop_notifications').insert(rows);

    setSending(false);
    if (error) {
      setStatus(`Could not send test notification: ${error.message}`);
    } else {
      const recipients = [ownerName, 'Kapil', ownerEmail.toLowerCase() !== ROSTAN_EMAIL ? 'Rostan' : null]
        .filter(Boolean) as string[];
      setStatus(`Test notification dispatched to: ${recipients.join(', ')}. They will see it on their browser if notifications are enabled.`);
    }
  }, [isViraj]);

  return { isViraj, sending, status, triggerTest };
}
