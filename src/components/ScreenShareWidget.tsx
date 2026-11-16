import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui';
import { Monitor, MonitorOff, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';

const SIGNALING_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/screen-monitoring-signaling`;

interface ScreenShareSession {
  id: string;
  session_token: string;
  status: string;
}

export default function ScreenShareWidget() {
  const { user, profile } = useAuth();
  const [sharing, setSharing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const offerPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const icePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  async function apiCall(payload: Record<string, unknown>): Promise<Response> {
    const token = await getToken();
    return fetch(SIGNALING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  }

  const stopSharing = useCallback(async () => {
    // Stop all polling
    if (offerPollRef.current) { clearInterval(offerPollRef.current); offerPollRef.current = null; }
    if (icePollRef.current) { clearInterval(icePollRef.current); icePollRef.current = null; }
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }

    // Close peer connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    // Stop screen tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Clear signaling
    if (currentSessionIdRef.current) {
      await apiCall({
        action: 'clear',
        session_id: currentSessionIdRef.current,
        session_token: sessionTokenRef.current,
      }).catch(() => {});
      currentSessionIdRef.current = null;
    }

    // Update session status in DB
    if (sessionTokenRef.current) {
      await supabase
        .from('screen_share_sessions')
        .update({ status: 'stopped', stopped_at: new Date().toISOString() })
        .eq('session_token', sessionTokenRef.current)
        .maybeSingle();
      sessionTokenRef.current = null;
    }

    setSharing(false);
    setSessionId(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function startSharing() {
    setStarting(true);
    setError(null);

    try {
      // Request screen share permission from browser
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false,
      });
      streamRef.current = stream;

      // Listen for the user stopping via browser UI
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        stopSharing();
      });

      // Create session in DB
      const sessionToken = crypto.randomUUID();
      const { error: insertError } = await supabase
        .from('screen_share_sessions')
        .insert({
          user_id: user?.id,
          team_member_id: profile?.team_member_id ?? null,
          employee_email: user?.email ?? '',
          employee_name: profile?.display_name ?? null,
          status: 'sharing',
          session_token: sessionToken,
        });

      if (insertError) {
        stream.getTracks().forEach((t) => t.stop());
        setError('Failed to start sharing session.');
        setStarting(false);
        return;
      }

      sessionTokenRef.current = sessionToken;
      setSharing(true);
      setStarting(false);

      // Start heartbeat to keep session alive
      heartbeatRef.current = setInterval(async () => {
        if (!sessionTokenRef.current) return;
        await apiCall({ action: 'heartbeat', session_token: sessionTokenRef.current }).catch(() => {});
      }, 15000);

      // Poll for incoming offers from Masters
      offerPollRef.current = setInterval(async () => {
        if (!sessionTokenRef.current) return;
        try {
          const res = await apiCall({ action: 'get_offer', session_token: sessionTokenRef.current });
          const data = await res.json();
          if (data.offer && data.session_id) {
            // Got an offer — handle it
            await handleOffer(data.offer, data.session_id);
          }
        } catch { /* ignore */ }
      }, 2000);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Screen sharing permission was denied.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to start screen sharing.');
      }
      setStarting(false);
    }
  }

  async function handleOffer(offerSdp: string, offerSessionId: string) {
    currentSessionIdRef.current = offerSessionId;
    setSessionId(offerSessionId);

    // Stop the offer poll while we handle this connection
    if (offerPollRef.current) { clearInterval(offerPollRef.current); offerPollRef.current = null; }

    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });
      pcRef.current = pc;

      // Add screen tracks to the connection
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, streamRef.current!);
        });
      }

      // Set remote description (the offer from the Master)
      await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });

      // Create and send answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const localDescription = pc.localDescription;
      if (!localDescription?.sdp) {
        throw new Error('Failed to create screen share answer.');
      }

      await apiCall({
        action: 'answer',
        session_token: sessionTokenRef.current,
        sdp: localDescription.sdp,
        session_id: offerSessionId,
      });

      // Send ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && currentSessionIdRef.current) {
          apiCall({
            action: 'ice',
            session_id: currentSessionIdRef.current,
            ice_candidate: event.candidate.candidate,
            ice_sdp_mid: event.candidate.sdpMid,
            ice_sdp_mline_index: event.candidate.sdpMLineIndex,
          }).catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
          // Connection ended — resume polling for new offers
          if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
          currentSessionIdRef.current = null;
          setSessionId(null);

          // Clear signaling for this session
          apiCall({ action: 'clear', session_id: offerSessionId, session_token: sessionTokenRef.current }).catch(() => {});

          // Resume offer polling
          if (!offerPollRef.current && sessionTokenRef.current) {
            offerPollRef.current = setInterval(async () => {
              if (!sessionTokenRef.current) return;
              try {
                const res = await apiCall({ action: 'get_offer', session_token: sessionTokenRef.current });
                const data = await res.json();
                if (data.offer && data.session_id) {
                  await handleOffer(data.offer, data.session_id);
                }
              } catch { /* ignore */ }
            }, 2000);
          }
        }
      };

      // Poll for ICE candidates from the viewer
      icePollRef.current = setInterval(async () => {
        if (!currentSessionIdRef.current) return;
        try {
          const res = await apiCall({ action: 'get_ice', session_id: currentSessionIdRef.current });
          const data = await res.json();
          if (data.candidates && data.candidates.length > 0) {
            for (const c of data.candidates) {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to handle viewing request.');
      currentSessionIdRef.current = null;
      setSessionId(null);
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (offerPollRef.current) clearInterval(offerPollRef.current);
      if (icePollRef.current) clearInterval(icePollRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (pcRef.current) pcRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="rounded-2xl border border-[#e5ebf3] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Monitor className="h-4 w-4 text-[#1478d4]" />
        <h2 className="text-sm font-semibold text-[#17243d]">Screen Sharing</h2>
      </div>

      <p className="mb-4 text-xs text-[#5a6c84]">
        Share your screen with authorized Masters for live monitoring. Your browser will ask for permission —
        you choose what to share and can stop at any time.
      </p>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {sharing ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
            <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-emerald-700">
              {sessionId ? 'A Master is viewing your screen' : 'Screen sharing is active — waiting for a Master to connect'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[#5a6c84]">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span>Encrypted WebRTC connection. Sessions are logged. You can stop sharing at any time.</span>
          </div>

          <Button variant="danger" size="sm" onClick={stopSharing} className="w-full">
            <MonitorOff className="h-3.5 w-3.5" /> Stop Sharing
          </Button>
        </div>
      ) : (
        <Button onClick={startSharing} disabled={starting} className="w-full">
          {starting ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Requesting permission…</>
          ) : (
            <><Monitor className="h-3.5 w-3.5" /> Share My Screen</>
          )}
        </Button>
      )}
    </div>
  );
}
