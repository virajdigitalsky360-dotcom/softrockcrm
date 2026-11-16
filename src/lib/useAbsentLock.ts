import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

const VIRAJ_EMAIL = 'viraj.digitalsky360@gmail.com';
const KAPIL_EMAIL = 'kapilprajapati9054@gmail.com';
const ROSTAN_EMAIL = 'softrockind@gmail.com';
const EXEMPT_EMAILS = [VIRAJ_EMAIL, KAPIL_EMAIL, ROSTAN_EMAIL];
const LOCK_START_DATE = '2026-10-01';

function istDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function isSunday(dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00+05:30');
  return d.getDay() === 0;
}

export type AbsentLockState = 'checking' | 'locked' | 'unlocked';

export type AbsentReason = 'crm_down' | 'no_task_assigned' | 'forgot_to_add_task' | 'other';

export const REASONS_REQUIRING_SCREENSHOT: AbsentReason[] = ['no_task_assigned', 'forgot_to_add_task'];
export const REASONS_REQUIRING_EXPLANATION: AbsentReason[] = ['other'];

export function useAbsentLock() {
  const { user, profile, loading: authLoading } = useAuth();
  const [state, setState] = useState<AbsentLockState>('checking');

  // Keep the latest check logic in a ref so the realtime subscription
  // can persist across re-renders without being torn down and recreated.
  const runCheck = useCallback(async () => {
    if (authLoading) return;
    if (!user) { setState('unlocked'); return; }

    const userEmail = (user.email ?? '').toLowerCase();
    if (EXEMPT_EMAILS.includes(userEmail)) { setState('unlocked'); return; }

    const today = istDate();
    if (today < LOCK_START_DATE) { setState('unlocked'); return; }
    if (isSunday(today)) { setState('unlocked'); return; }

    const teamMemberId = profile?.team_member_id;
    if (!teamMemberId) { setState('unlocked'); return; }

    const { data: rec, error: recError } = await supabase
      .from('attendance_records')
      .select('id, status')
      .eq('team_member_id', teamMemberId)
      .eq('attendance_date', today)
      .maybeSingle();

    // If the lookup fails (missing table, RLS, network), never block the app.
    if (recError) { setState('unlocked'); return; }
    if (!rec || rec.status !== 'absent') { setState('unlocked'); return; }

    const { data: submission, error: subError } = await supabase
      .from('absent_reason_submissions')
      .select('id, reason, screenshot_url, arrival_time, verified_by, explanation, crm_down_verified')
      .eq('user_id', user.id)
      .eq('attendance_date', today)
      .maybeSingle();

    if (subError) { setState('unlocked'); return; }

    if (submission) {
      // If the reason is crm_down but verification failed, stay locked
      if (submission.reason === 'crm_down' && submission.crm_down_verified === 'not_verified') {
        setState('locked');
        return;
      }
      // If the reason requires a screenshot but none was uploaded, stay locked
      if (REASONS_REQUIRING_SCREENSHOT.includes(submission.reason as AbsentReason) && !submission.screenshot_url) {
        setState('locked');
        return;
      }
      // If the reason requires an explanation but none was provided, stay locked
      if (REASONS_REQUIRING_EXPLANATION.includes(submission.reason as AbsentReason) && !submission.explanation?.trim()) {
        setState('locked');
        return;
      }
      setState('unlocked');
      return;
    }
    setState('locked');
  }, [user, profile, authLoading]);

  // Never let an unexpected error leave the app stuck on the loader.
  const checkRef = useCallback(async () => {
    try {
      await runCheck();
    } catch {
      setState('unlocked');
    }
  }, [runCheck]);

  // Store the latest check function in a ref so the subscription effect
  // can call it without depending on it (avoiding channel teardown/recreate).
  const checkFnRef = useRef(checkRef);
  checkFnRef.current = checkRef;

  // Debounce rapid successive realtime events to avoid duplicate queries.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-check whenever auth finishes loading or the identity changes. Without
  // this, a check that ran while auth was still loading returned early and the
  // state stayed 'checking' forever (infinite spinner).
  useEffect(() => {
    checkFnRef.current();
  }, [authLoading, user?.id, profile?.team_member_id]);

  // Safety net: if the check never resolves (e.g. realtime/network problems),
  // stop blocking the UI after 6 seconds.
  useEffect(() => {
    const t = setTimeout(() => {
      setState((s) => (s === 'checking' ? 'unlocked' : s));
    }, 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // Initial check on mount or when user identity changes
    checkFnRef.current();

    const teamMemberId = profile?.team_member_id;
    const userId = user?.id;

    // Unique channel name per user to prevent duplicate subscriptions
    // across re-renders or component re-mounts.
    const channelName = `absent-lock-rt-${userId ?? 'anon'}`;

    let channel = supabase
      .channel(channelName);

    // Only filter by team_member_id if we have one; otherwise listen broadly
    // (the check function itself will short-circuit for exempt users).
    if (teamMemberId) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_records', filter: `team_member_id=eq.${teamMemberId}` },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => checkFnRef.current(), 150);
        },
      );
    } else {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_records' },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => checkFnRef.current(), 150);
        },
      );
    }

    // Listen for absent_reason_submissions changes for this user
    if (userId) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'absent_reason_submissions', filter: `user_id=eq.${userId}` },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => checkFnRef.current(), 150);
        },
      );
    }

    // On reconnect/re-subscribe, re-fetch the latest state to avoid
    // missing events during the disconnect window.
    channel = channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        checkFnRef.current();
      }
    });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.team_member_id]);

  return { state, recheck: checkRef };
}

export async function submitAbsentReason(
  userId: string,
  teamMemberId: string | null,
  reason: AbsentReason,
  explanation: string,
  screenshotPath: string | null = null,
  arrivalTime: string | null = null,
): Promise<{ error: string | null }> {
  const today = istDate();
  const { error } = await supabase
    .from('absent_reason_submissions')
    .upsert({
      user_id: userId,
      team_member_id: teamMemberId,
      attendance_date: today,
      reason,
      explanation: explanation.trim() || null,
      screenshot_url: screenshotPath,
      arrival_time: arrivalTime,
    }, { onConflict: 'user_id,attendance_date' });
  if (error) return { error: error.message };
  return { error: null };
}

export async function uploadScreenshot(userId: string, file: File): Promise<{ storagePath: string | null; error: string | null }> {
  const today = istDate();
  const ext = file.name.split('.').pop() || 'png';
  const path = `${userId}/${today}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase
    .storage
    .from('absent-screenshots')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (uploadError) return { storagePath: null, error: uploadError.message };

  return { storagePath: path, error: null };
}

export function getAbsentScreenshotStoragePath(reference: string): string | null {
  if (!/^https?:\/\//i.test(reference)) return reference || null;

  try {
    const url = new URL(reference);
    const prefix = '/storage/v1/object/sign/absent-screenshots/';
    const prefixIndex = url.pathname.indexOf(prefix);
    if (prefixIndex < 0) return null;
    return decodeURIComponent(url.pathname.slice(prefixIndex + prefix.length));
  } catch {
    return null;
  }
}

export { VIRAJ_EMAIL, KAPIL_EMAIL };
