import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface SystemAlert {
  id: string;
  severity: 'error' | 'warning' | 'info';
  module: string;
  title: string;
  message: string;
  dedup_key: string;
  occurrence_count: number;
  is_read: boolean;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

const SENSITIVE_PATTERNS = [
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /sk_[A-Za-z0-9]+/g,
  /Bearer\s+[A-Za-z0-9_.\-]+/gi,
  /password\s*[:=]\s*\S+/gi,
  /api[_-]?key\s*[:=]\s*\S+/gi,
  /secret\s*[:=]\s*\S+/gi,
  /sbp_[A-Za-z0-9]+/g,
];

function maskSensitive(text: string): string {
  let masked = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    masked = masked.replace(pattern, '[REDACTED]');
  }
  if (masked.length > 500) masked = masked.slice(0, 500) + '...';
  return masked;
}

export function reportAlert(params: {
  severity?: 'error' | 'warning' | 'info';
  module: string;
  title: string;
  message: string;
  dedupKey: string;
}) {
  const { severity = 'error', module, title, message, dedupKey } = params;
  const cleanMessage = maskSensitive(message);
  const cleanTitle = maskSensitive(title);
  const dedupKeyHash = `${module}:${dedupKey}`;

  supabase
    .from('system_alerts')
    .insert({
      severity,
      module,
      title: cleanTitle,
      message: cleanMessage,
      dedup_key: dedupKeyHash,
    })
    .then(({ error }) => {
      if (error && error.code === '23505') {
        // Duplicate key — update occurrence count and last_seen_at via RPC
        supabase.rpc('increment_system_alert', { p_dedup_key: dedupKeyHash }).then(() => {});
      }
    });
}

export function reportSupabaseError(
  error: { message?: string; code?: string } | null,
  module: string,
  action: string,
) {
  if (!error) return;
  const code = error.code ?? 'unknown';
  const isRLS = code === '42501' || (error.message ?? '').toLowerCase().includes('row-level security');
  const isAuth = code === 'PGRST301' || (error.message ?? '').toLowerCase().includes('jwt') || (error.message ?? '').toLowerCase().includes('unauthorized');

  let severity: 'error' | 'warning' = 'error';
  let title = `${action} failed`;
  if (isRLS) title = `${action} blocked by permissions`;
  else if (isAuth) title = `${action} — authentication error`;

  reportAlert({
    severity,
    module,
    title,
    message: `Reason: ${isRLS ? 'Permission/RLS error' : isAuth ? 'Authentication error' : error.message ?? 'Unknown error'}. Error code: ${code}`,
    dedupKey: `${action}:${code}`,
  });
}

export function useCrmAssistant() {
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('system_alerts')
      .select('*')
      .order('is_read', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      setLoading(false);
      return;
    }
    setAlerts((data ?? []) as SystemAlert[]);
    setUnreadCount((data ?? []).filter((a) => !a.is_read).length);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('system-alerts-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_alerts' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const markAsRead = useCallback(async (alertId: string) => {
    await supabase.from('system_alerts').update({ is_read: true }).eq('id', alertId);
  }, []);

  const markAllRead = useCallback(async () => {
    const unreadIds = alerts.filter((a) => !a.is_read).map((a) => a.id);
    if (unreadIds.length === 0) return;
    for (const id of unreadIds) {
      await supabase.from('system_alerts').update({ is_read: true }).eq('id', id);
    }
  }, [alerts]);

  const clearAlert = useCallback(async (alertId: string) => {
    await supabase.from('system_alerts').delete().eq('id', alertId);
  }, []);

  return { alerts, unreadCount, loading, markAsRead, markAllRead, clearAlert, reload: load };
}

export function useGlobalErrorCapture() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportAlert({
        severity: 'error',
        module: 'System',
        title: 'Unexpected error occurred',
        message: `${event.message || 'Unknown runtime error'}. Source: ${event.filename?.split('/').pop() ?? 'unknown'}:${event.lineno ?? 0}`,
        dedupKey: `runtime:${event.message?.slice(0, 80)}`,
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? 'Unknown');
      reportAlert({
        severity: 'error',
        module: 'System',
        title: 'Unhandled promise rejection',
        message: maskSensitive(reason),
        dedupKey: `rejection:${reason.slice(0, 80)}`,
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
}
