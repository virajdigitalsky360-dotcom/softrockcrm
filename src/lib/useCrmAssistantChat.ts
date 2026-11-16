import { useState, useCallback, useRef } from 'react';
import { supabase } from './supabase';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: 'working' | 'completed' | 'failed' | 'needs_confirmation';
  timestamp: string;
  pendingIntent?: unknown;
}

interface AssistantResponse {
  response: string;
  status?: 'completed' | 'failed' | 'needs_confirmation';
  pendingIntent?: unknown;
  version?: string;
}

const GREETING =
  "Hi Viraj! I'm your AI CRM Assistant. Tell me what you need and I'll do it directly. Try:\n\n• 'Rostan ને આજે task add કરી આપ'\n• 'આ task Approved કરી દે'\n• 'કાલે office બંધ છે'\n• 'આજના pending tasks બતાવ'\n• 'Maintenance Mode ON કર'";

let idCounter = 0;
function nextId() { idCounter += 1; return `m${idCounter}`; }

export function useCrmAssistantChat() {
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { id: nextId(), role: 'assistant', content: GREETING, timestamp: new Date().toISOString() },
  ]);
  const [loading, setLoading] = useState(false);
  const pendingRef = useRef<{ intent: unknown } | null>(null);

  const sendMessage = useCallback(async (text: string): Promise<void> => {
    if (!text.trim() || loading) return;

    const userMsg: AssistantMessage = {
      id: nextId(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    const workingId = nextId();
    setMessages((prev) => [...prev, {
      id: workingId,
      role: 'assistant',
      content: 'Working…',
      status: 'working',
      timestamp: new Date().toISOString(),
    }]);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setMessages((prev) => prev.map((m) => m.id === workingId
          ? { ...m, content: 'Authentication error. Please sign in again.', status: 'failed' }
          : m));
        setLoading(false);
        return;
      }

      const isConfirm = text.trim().toLowerCase() === 'yes' || text.trim().toLowerCase() === 'ok' || text.trim().toLowerCase() === 'confirm';
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-assistant`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          message: text,
          confirm: isConfirm && pendingRef.current !== null,
          pendingIntent: pendingRef.current?.intent ?? null,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const errMsg = (errBody as { error?: string }).error ?? `Request failed (${response.status})`;
        setMessages((prev) => prev.map((m) => m.id === workingId
          ? { ...m, content: errMsg, status: 'failed' }
          : m));
        setLoading(false);
        return;
      }

      const data = (await response.json()) as AssistantResponse;

      if (data.status === 'needs_confirmation' && data.pendingIntent) {
        pendingRef.current = { intent: data.pendingIntent };
      } else if (data.status === 'completed' || data.status === 'failed') {
        pendingRef.current = null;
      }

      setMessages((prev) => prev.map((m) => m.id === workingId
        ? { ...m, content: data.response, status: data.status ?? 'completed', pendingIntent: data.pendingIntent }
        : m));
    } catch {
      setMessages((prev) => prev.map((m) => m.id === workingId
        ? { ...m, content: 'Connection error. Please try again.', status: 'failed' }
        : m));
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const reset = useCallback(() => {
    pendingRef.current = null;
    setMessages([{ id: nextId(), role: 'assistant', content: GREETING, timestamp: new Date().toISOString() }]);
  }, []);

  return { messages, loading, sendMessage, reset };
}
