import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, PageLoader, EmptyState, Button, Modal } from '@/components/ui';
import {
  Monitor, MonitorOff, Eye, EyeOff, Maximize2, Minimize2, Wifi, WifiOff,
  ShieldCheck, AlertTriangle, Activity, CircleDot, Cpu, Plus, Trash2, Copy,
} from 'lucide-react';

interface ShareSession {
  id: string;
  user_id: string;
  team_member_id: string | null;
  employee_email: string;
  employee_name: string | null;
  status: string;
  session_token: string;
  started_at: string;
  last_heartbeat_at: string;
  device_id: string | null;
  source: string;
}

interface ScreenViewLog {
  id: string;
  viewer_email: string | null;
  employee_name: string | null;
  action: string;
  session_id: string | null;
  created_at: string;
}

interface MonitoringDevice {
  id: string;
  device_token: string;
  device_name: string;
  status: string;
  last_heartbeat_at: string | null;
  team_member_id: string | null;
  user_id: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

const SIGNALING_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/screen-monitoring-signaling`;

function timeAgo(ts: string | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  const secs = Math.floor(diff / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'just now';
}

function formatDateTime(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function isStale(session: ShareSession): boolean {
  if (session.status !== 'sharing') return true;
  const age = Date.now() - new Date(session.last_heartbeat_at).getTime();
  return age > 45000;
}

export default function ScreenMonitoring() {
  const [sessions, setSessions] = useState<ShareSession[]>([]);
  const [viewLogs, setViewLogs] = useState<ScreenViewLog[]>([]);
  const [devices, setDevices] = useState<MonitoringDevice[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsOpen, setLogsOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ShareSession | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [registering, setRegistering] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const [sessRes, logRes, devRes] = await Promise.all([
      supabase.from('screen_share_sessions').select('*').order('started_at', { ascending: false }),
      supabase.from('screen_view_logs').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('monitoring_devices').select('*').order('created_at', { ascending: false }),
    ]);
    setSessions((sessRes.data ?? []) as ShareSession[]);
    setViewLogs((logRes.data ?? []) as ScreenViewLog[]);
    setDevices((devRes.data ?? []) as MonitoringDevice[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('screen-monitoring-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'screen_share_sessions' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'screen_view_logs' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitoring_devices' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => load(), 10000);
    return () => clearInterval(interval);
  }, [load]);

  // Load team members for device registration
  useEffect(() => {
    if (registerOpen && teamMembers.length === 0) {
      supabase
        .from('team_members')
        .select('id, name, email')
        .order('name')
        .then(({ data }) => {
          if (data) setTeamMembers(data as TeamMember[]);
        });
    }
  }, [registerOpen, teamMembers.length]);

  const activeSessions = sessions.filter((s) => !isStale(s));
  const staleSessions = sessions.filter((s) => isStale(s) && s.status === 'sharing').slice(0, 5);
  const onlineDevices = devices.filter((d) => d.status === 'online');
  const offlineDevices = devices.filter((d) => d.status === 'offline');

  function openViewer(s: ShareSession) {
    setSelectedSession(s);
    setViewerOpen(true);
  }

  async function registerDevice() {
    if (!selectedMemberId || !newDeviceName.trim()) return;
    setRegistering(true);
    try {
      // Find the user profile for this team member
      const { data: member } = await supabase
        .from('team_members')
        .select('email')
        .eq('id', selectedMemberId)
        .maybeSingle();

      if (!member) { setRegistering(false); return; }

      const { data: userProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', (member as { email: string }).email)
        .maybeSingle();

      if (!userProfile) { setRegistering(false); return; }

      const token = crypto.randomUUID();
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('monitoring_devices').insert({
        device_token: token,
        team_member_id: selectedMemberId,
        user_id: (userProfile as { id: string }).id,
        device_name: newDeviceName.trim(),
        status: 'offline',
        created_by: user?.id,
      });

      if (error) {
        setRegistering(false);
        return;
      }

      setNewToken(token);
      setRegistering(false);
      load();
    } catch {
      setRegistering(false);
    }
  }

  async function deleteDevice(deviceId: string) {
    await supabase.from('monitoring_devices').delete().eq('id', deviceId);
    load();
  }

  function copyToken() {
    if (newToken) {
      navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function closeRegisterModal() {
    setRegisterOpen(false);
    setNewDeviceName('');
    setSelectedMemberId('');
    setNewToken(null);
    setCopied(false);
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-[#dbe5f0] bg-[#fbfcfe] px-4 py-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1478d4]" />
        <div className="flex-1">
          <p className="text-sm font-medium text-[#17243d]">Team Screen Monitoring</p>
          <p className="mt-0.5 text-xs text-[#5a6c84]">
            View live screens of team members. Desktop agents stream automatically without manual action.
            Browser-based sharing requires the employee to click "Share My Screen". All viewing sessions are logged.
          </p>
        </div>
        <Button size="sm" variant="subtle" onClick={() => setRegisterOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Register Device
        </Button>
      </div>

      {/* Registered monitoring devices */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#e5ebf3] px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#17243d]">
            <Cpu className="h-4 w-4 text-[#1478d4]" /> Desktop Agents
          </h2>
          <span className="text-xs text-[#5a6c84]">
            {onlineDevices.length} online · {offlineDevices.length} offline
          </span>
        </div>

        {devices.length === 0 ? (
          <EmptyState
            title="No desktop agents registered"
            hint="Register a device to enable automatic screen monitoring without manual sharing."
          />
        ) : (
          <div className="divide-y divide-[#edf1f6]">
            {devices.map((d) => (
              <div key={d.id} className="group flex items-center gap-4 px-5 py-4 transition-all duration-200 hover:bg-[#fbfcfe]">
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                  d.status === 'online' ? 'bg-emerald-500/10' : 'bg-slate-200'
                }`}>
                  {d.status === 'online'
                    ? <Cpu className="h-5 w-5 text-emerald-600" />
                    : <Cpu className="h-5 w-5 text-slate-400" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[#17243d]">{d.device_name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      d.status === 'online'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-200 text-slate-500'
                    }`}>
                      {d.status === 'online' ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#5a6c84]">
                    Last heartbeat {timeAgo(d.last_heartbeat_at)}
                  </p>
                </div>
                <button
                  onClick={() => deleteDevice(d.id)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                  title="Remove device"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Active sharing sessions */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#e5ebf3] px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#17243d]">
            <Monitor className="h-4 w-4 text-[#1478d4]" /> Active Screen Shares
          </h2>
          <Button size="sm" variant="subtle" onClick={() => setLogsOpen(true)}>
            <Activity className="h-3.5 w-3.5" /> View Logs
          </Button>
        </div>

        {activeSessions.length === 0 ? (
          <EmptyState
            title="No active screen shares"
            hint="Desktop agents appear here when online. Employees can also click 'Share My Screen' on their dashboard."
          />
        ) : (
          <div className="divide-y divide-[#edf1f6]">
            {activeSessions.map((s) => (
              <div key={s.id} className="group flex items-center gap-4 px-5 py-4 transition-all duration-200 hover:bg-[#fbfcfe]">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10">
                  {s.source === 'agent'
                    ? <Cpu className="h-5 w-5 text-emerald-600" />
                    : <Wifi className="h-5 w-5 text-emerald-600" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[#17243d]">{s.employee_name ?? s.employee_email}</p>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">SHARING</span>
                    {s.source === 'agent' && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">AGENT</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-[#5a6c84]">
                    {s.employee_email} · Started {timeAgo(s.started_at)} · Last heartbeat {timeAgo(s.last_heartbeat_at)}
                  </p>
                </div>
                <Button size="sm" variant="subtle" onClick={() => openViewer(s)}>
                  <Eye className="h-3.5 w-3.5" /> View Screen
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Recently disconnected */}
      {staleSessions.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[#e5ebf3] px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[#5a6c84]">
              <WifiOff className="h-4 w-4 text-slate-400" /> Recently Disconnected
            </h2>
          </div>
          <div className="divide-y divide-[#edf1f6]">
            {staleSessions.map((s) => (
              <div key={s.id} className="flex items-center gap-4 px-5 py-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-200">
                  <WifiOff className="h-4 w-4 text-slate-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-[#5a6c84]">{s.employee_name ?? s.employee_email}</p>
                  <p className="text-xs text-[#9aa8bd]">Last seen {timeAgo(s.last_heartbeat_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Screen viewer */}
      {selectedSession && (
        <ScreenViewer
          session={selectedSession}
          open={viewerOpen}
          onClose={() => { setViewerOpen(false); setSelectedSession(null); }}
        />
      )}

      {/* View logs modal */}
      <Modal open={logsOpen} onClose={() => setLogsOpen(false)} title="Screen Viewing Audit Log" maxWidth="max-w-2xl">
        <div className="max-h-[60vh] overflow-y-auto">
          {viewLogs.length === 0 ? (
            <EmptyState title="No viewing sessions logged" />
          ) : (
            <div className="divide-y divide-[#edf1f6]">
              {viewLogs.map((log) => (
                <div key={log.id} className="flex items-center gap-3 px-1 py-2.5">
                  <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                    log.action === 'start_view' ? 'bg-emerald-500/10' : 'bg-slate-200'
                  }`}>
                    {log.action === 'start_view' ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-slate-400" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-[#17243d]">
                      <span className="font-medium">{log.viewer_email ?? 'Unknown'}</span>
                      {' '}{log.action === 'start_view' ? 'started viewing' : 'stopped viewing'}{' '}
                      <span className="font-medium">{log.employee_name ?? 'Unknown employee'}</span>
                    </p>
                    <p className="text-xs text-[#5a6c84]">{formatDateTime(log.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Register device modal */}
      <Modal open={registerOpen} onClose={closeRegisterModal} title="Register Desktop Agent" maxWidth="max-w-lg">
        {newToken ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
              <p className="text-sm font-medium text-emerald-700">Device registered successfully!</p>
              <p className="mt-1 text-xs text-emerald-600">
                Give this token to the employee. They run the agent with:
              </p>
            </div>
            <div className="rounded-lg bg-slate-900 px-4 py-3">
              <code className="text-xs text-emerald-400 break-all">python screen_agent.py --token {newToken}</code>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg border border-[#e5ebf3] bg-[#fbfcfe] px-3 py-2">
                <code className="text-xs text-[#17243d] break-all">{newToken}</code>
              </div>
              <Button size="sm" variant="subtle" onClick={copyToken}>
                <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <Button onClick={closeRegisterModal} className="w-full">Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#5a6c84]">Select Employee</label>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="w-full rounded-lg border border-[#e5ebf3] bg-white px-3 py-2 text-sm text-[#17243d] outline-none focus:border-[#1478d4]"
              >
                <option value="">Choose an employee…</option>
                {teamMembers
                  .filter((m) => {
                    const email = m.email?.toLowerCase() ?? '';
                    return !SCREEN_MONITOR_EMAILS.includes(email);
                  })
                  .map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#5a6c84]">Device Name</label>
              <input
                type="text"
                value={newDeviceName}
                onChange={(e) => setNewDeviceName(e.target.value)}
                placeholder="e.g. Irfan's Laptop"
                className="w-full rounded-lg border border-[#e5ebf3] bg-white px-3 py-2 text-sm text-[#17243d] outline-none focus:border-[#1478d4]"
              />
            </div>
            <div className="rounded-lg border border-[#dbe5f0] bg-[#fbfcfe] px-3 py-2.5">
              <p className="text-xs text-[#5a6c84]">
                The employee installs Python and runs the agent with the generated token.
                The agent streams their screen automatically when a Master initiates viewing —
                no manual "Share My Screen" click required. One-time consent is shown on first run.
              </p>
            </div>
            <Button
              onClick={registerDevice}
              disabled={!selectedMemberId || !newDeviceName.trim() || registering}
              className="w-full"
            >
              {registering ? 'Registering…' : 'Register Device'}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

const SCREEN_MONITOR_EMAILS = [
  'viraj.digitalsky360@gmail.com',
  'kapilprajapati9054@gmail.com',
];

// --- Screen Viewer Component ---
function ScreenViewer({
  session,
  open,
  onClose,
}: {
  session: ShareSession;
  open: boolean;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const answerPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const icePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data: { session: authSession } } = await supabase.auth.getSession();
    return authSession?.access_token ?? null;
  }, []);

  async function apiCall(payload: Record<string, unknown>): Promise<Response> {
    const token = await getToken();
    return fetch(SIGNALING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  }

  const stopViewing = useCallback(async () => {
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (answerPollRef.current) { clearInterval(answerPollRef.current); answerPollRef.current = null; }
    if (icePollRef.current) { clearInterval(icePollRef.current); icePollRef.current = null; }
    if (sessionIdRef.current) {
      await apiCall({ action: 'clear', session_id: sessionIdRef.current }).catch(() => {});
      sessionIdRef.current = null;
    }
    setConnected(false);
    setConnecting(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startViewing = useCallback(async () => {
    setConnecting(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) { setError('Not authenticated.'); setConnecting(false); return; }

      const sessionId = crypto.randomUUID();
      sessionIdRef.current = sessionId;

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });
      pcRef.current = pc;

      pc.ontrack = (event) => {
        const video = videoRef.current;
        if (video) {
          video.srcObject = event.streams[0];
          setConnected(true);
          setConnecting(false);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setError('Connection lost. The employee may have stopped sharing or the agent went offline.');
          setConnected(false);
          setConnecting(false);
        }
      };

      pc.addTransceiver('video', { direction: 'recvonly' });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const offerRes = await apiCall({
        action: 'offer',
        session_token: session.session_token,
        sdp: offer.sdp,
        session_id: sessionId,
      });

      if (!offerRes.ok) {
        const errData = await offerRes.json().catch(() => null);
        throw new Error(errData?.error ?? 'Failed to send offer');
      }

      let attempts = 0;
      answerPollRef.current = setInterval(async () => {
        if (!sessionIdRef.current) return;
        attempts++;
        if (attempts > 30) {
          setError('The agent or employee did not respond. They may be offline or the agent is not running.');
          setConnecting(false);
          if (answerPollRef.current) { clearInterval(answerPollRef.current); answerPollRef.current = null; }
          return;
        }
        try {
          const res = await apiCall({ action: 'get_answer', session_id: sessionId });
          const data = await res.json();
          if (data.answer) {
            if (answerPollRef.current) { clearInterval(answerPollRef.current); answerPollRef.current = null; }
            await pc.setRemoteDescription({ type: 'answer', sdp: data.answer });

            icePollRef.current = setInterval(async () => {
              if (!sessionIdRef.current) return;
              try {
                const iceRes = await apiCall({ action: 'get_ice', session_id: sessionId });
                const iceData = await iceRes.json();
                if (iceData.candidates) {
                  for (const c of iceData.candidates) {
                    if (c.sdp) {
                      try {
                        await pc.addIceCandidate({
                          candidate: c.sdp,
                          sdpMid: c.ice_sdp_mid ?? null,
                          sdpMLineIndex: c.ice_sdp_mline_index ?? null,
                        });
                      } catch { /* duplicate */ }
                    }
                  }
                }
              } catch { /* ignore */ }
            }, 500);
          }
        } catch { /* ignore */ }
      }, 1000);

      pc.onicecandidate = (event) => {
        if (event.candidate && sessionIdRef.current) {
          apiCall({
            action: 'ice',
            session_id: sessionIdRef.current,
            ice_candidate: event.candidate.candidate,
            ice_sdp_mid: event.candidate.sdpMid,
            ice_sdp_mline_index: event.candidate.sdpMLineIndex,
          }).catch(() => {});
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setConnecting(false);
    }
  }, [session.session_token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && !connected && !connecting && !error) {
      startViewing();
    }
    return () => {
      if (!open) stopViewing();
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleFullscreen() {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
    }
  }

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#07111a] px-4 py-8">
      <div className="relative w-full max-w-5xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`grid h-10 w-10 place-items-center rounded-xl ${
              connected ? 'bg-emerald-500/15' : 'bg-amber-500/15'
            }`}>
              {connected ? <Monitor className="h-5 w-5 text-emerald-400" /> : <MonitorOff className="h-5 w-5 text-amber-400" />}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Live Screen — {session.employee_name ?? session.employee_email}</h2>
              <p className="text-xs text-gray-400">
                {session.employee_email} ·
                {session.source === 'agent' && <span className="ml-1 font-medium text-blue-400">Desktop Agent</span>}
                <span className={`ml-1 font-medium ${connected ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {connected ? 'Connected' : connecting ? 'Connecting…' : 'Offline'}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connected && (
              <button
                onClick={toggleFullscreen}
                className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white transition hover:bg-white/20"
                title="Fullscreen"
              >
                {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={() => { stopViewing(); onClose(); }}
              className="grid h-9 w-9 place-items-center rounded-lg bg-red-500/20 text-red-300 transition hover:bg-red-500/30"
              title="Close"
            >
              <span className="text-lg">×</span>
            </button>
          </div>
        </div>

        {/* Video container */}
        <div ref={containerRef} className="relative aspect-video overflow-hidden rounded-2xl border border-[#1b2a3e] bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-contain" />

          {connecting && !connected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              <p className="text-sm text-gray-300">Connecting to {session.source === 'agent' ? 'desktop agent' : 'employee\'s screen'}…</p>
              <p className="text-xs text-gray-500">Establishing secure WebRTC connection</p>
            </div>
          )}

          {error && !connected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80">
              <AlertTriangle className="h-10 w-10 text-amber-400" />
              <p className="text-sm text-gray-300">{error}</p>
              <button
                onClick={() => { setError(null); startViewing(); }}
                className="mt-2 rounded-lg bg-[#1478d4] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#1063b8]"
              >
                Retry Connection
              </button>
            </div>
          )}

          {!connected && !connecting && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80">
              <MonitorOff className="h-10 w-10 text-slate-500" />
              <p className="text-sm text-gray-400">Screen sharing is not active</p>
              <p className="text-xs text-gray-600">
                {session.source === 'agent'
                  ? 'The desktop agent may not be running. Ensure the agent is started on the employee\'s PC.'
                  : 'The employee needs to click "Share My Screen" and keep their browser open.'}
              </p>
            </div>
          )}

          {connected && (
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-500/90 px-2.5 py-1 text-[10px] font-bold text-white">
              <CircleDot className="h-3 w-3 animate-pulse" /> LIVE
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            Encrypted WebRTC · Session is logged
          </div>
          {connected && (
            <Button size="sm" variant="danger" onClick={() => stopViewing()}>
              <EyeOff className="h-3.5 w-3.5" /> Stop Viewing
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
