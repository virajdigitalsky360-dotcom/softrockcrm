import { useState, useCallback, useRef } from 'react';
import { supabase } from './supabase';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatbotResponse {
  response: string;
  action?: string;
  holidayDate?: string;
  holidayName?: string;
  pendingAction?: string;
  holidays?: Array<{ holiday_date: string; holiday_name: string }>;
  sundays?: string[];
}

export function useHolidayChatbot() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Hi Viraj! I can help you manage office holidays. Try:\n\n• "Tomorrow office is closed"\n• "25 September Janmashtami holiday"\n• "Remove 25 September holiday"\n• "Show upcoming office holidays"\n\nYou can also type in Gujarati: "કાલે office બંધ છે"',
    },
  ]);
  const [loading, setLoading] = useState(false);
  const pendingActionRef = useRef<{ action: string; date: string; name?: string } | null>(null);

  const sendMessage = useCallback(async (text: string): Promise<void> => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Authentication error. Please sign in again.' }]);
        setLoading(false);
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/holiday-chatbot`;
      const isConfirm = text.trim().toLowerCase() === 'yes' || text.trim().toLowerCase() === 'ok' || text.trim().toLowerCase() === 'confirm';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          message: text,
          confirm: isConfirm,
          history: messages,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        setMessages((prev) => [...prev, { role: 'assistant', content: errBody.error ?? `Request failed (${response.status})` }]);
        setLoading(false);
        return;
      }

      const data = (await response.json()) as ChatbotResponse;

      // Track pending action for confirm flow
      if (data.pendingAction && data.holidayDate) {
        pendingActionRef.current = {
          action: data.pendingAction,
          date: data.holidayDate,
          name: data.holidayName,
        };
      } else if (data.action === 'created' || data.action === 'removed') {
        pendingActionRef.current = null;
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages]);

  const reset = useCallback(() => {
    setMessages([{
      role: 'assistant',
      content: 'Hi Viraj! I can help you manage office holidays. Try:\n\n• "Tomorrow office is closed"\n• "25 September Janmashtami holiday"\n• "Remove 25 September holiday"\n• "Show upcoming office holidays"',
    }]);
    pendingActionRef.current = null;
  }, []);

  return { messages, loading, sendMessage, reset };
}
