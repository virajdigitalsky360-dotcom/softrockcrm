import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Sparkles, CheckCircle2, XCircle, Loader2, RotateCcw } from 'lucide-react';
import { useCrmAssistantChat, type AssistantMessage } from '@/lib/useCrmAssistantChat';

function statusIcon(status?: AssistantMessage['status']) {
  if (status === 'working') return <Loader2 className="h-3 w-3 animate-spin text-[#1478d4]" />;
  if (status === 'completed') return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
  if (status === 'failed') return <XCircle className="h-3 w-3 text-rose-500" />;
  return null;
}

function formatTimestamp(ts: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

const QUICK_SUGGESTIONS = [
  'CRM status બતાવ',
  'આજના pending tasks બતાવ',
  'કાલે office બંધ છે',
  'Rostan ને આજે task add કરી આપ',
];

export default function CrmAssistantWidget() {
  const [open, setOpen] = useState(false);
  const { messages, loading, sendMessage, reset } = useCrmAssistantChat();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function handleSend() {
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    await sendMessage(text);
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#1478d4] shadow-lg shadow-blue-500/30 transition-all duration-300 hover:scale-110 hover:shadow-blue-500/40 active:scale-95"
        title="AI CRM Assistant"
      >
        <Bot className="h-6 w-6 text-white" />
        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 ring-2 ring-[#f5f8fc]">
          <Sparkles className="h-2.5 w-2.5 text-[#17243d]" />
        </span>
        {!open && (
          <span className="absolute -right-1 -top-1 h-5 w-5 animate-ping rounded-full bg-[#1478d4]/40" />
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex max-h-[72vh] w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-[#e5ebf3] bg-white shadow-2xl sm:w-96">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#edf1f6] bg-[#fbfcfe] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-[#e8f1fb]">
                <Bot className="h-5 w-5 text-[#1478d4]" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#17243d]">AI CRM Assistant</p>
                <p className="text-[10px] text-[#5a6c84]">Powered by SOFTROCK · Viraj only</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={reset}
                className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] transition-colors hover:bg-[#eef5fc] hover:text-[#1478d4]"
                title="Reset conversation"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] transition-colors hover:bg-[#eef5fc] hover:text-[#17243d]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-[#f9fbfd] p-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${msg.role === 'user' ? '' : 'w-full'}`}>
                  <div
                    className={`whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[#1478d4] text-white'
                        : msg.status === 'failed'
                        ? 'border border-rose-200 bg-rose-50 text-rose-700'
                        : msg.status === 'working'
                        ? 'border border-[#e5ebf3] bg-white text-[#5a6c84]'
                        : 'border border-[#e5ebf3] bg-white text-[#263754]'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <div className={`mt-1 flex items-center gap-1.5 text-[10px] text-[#5a6c84] ${msg.role === 'user' ? 'justify-end' : ''}`}>
                    {msg.role === 'assistant' && statusIcon(msg.status)}
                    <span>{formatTimestamp(msg.timestamp)}</span>
                    {msg.status === 'completed' && <span className="font-medium text-emerald-600">Completed ✓</span>}
                    {msg.status === 'failed' && <span className="font-medium text-rose-600">Could not complete ✕</span>}
                    {msg.status === 'needs_confirmation' && <span className="font-medium text-amber-600">Reply "yes" to confirm</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick suggestions */}
          {messages.length <= 1 && (
            <div className="border-t border-[#edf1f6] px-4 py-2.5">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    disabled={loading}
                    className="rounded-full border border-[#dbe7f5] bg-[#eef5fc] px-2.5 py-1 text-[10px] font-medium text-[#1478d4] transition-all duration-200 hover:scale-105 hover:bg-[#e0edfb] disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-[#edf1f6] bg-white p-3">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Tell me what to do…"
                disabled={loading}
                className="flex-1 rounded-xl border border-[#e1e8f1] bg-[#fbfcfe] px-3 py-2.5 text-sm text-[#17243d] outline-none transition focus:border-[#1478d4] focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#1478d4] text-white transition-all duration-200 hover:scale-110 hover:bg-[#0f6dc3] active:scale-95 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-[#5a6c84]">
              The assistant performs real CRM actions. Type "yes" to confirm destructive actions.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
