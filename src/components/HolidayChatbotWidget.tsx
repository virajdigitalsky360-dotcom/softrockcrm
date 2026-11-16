import { useState, useRef, useEffect } from 'react';
import { Calendar, X, Send, Sparkles } from 'lucide-react';
import { useHolidayChatbot } from '@/lib/useHolidayChatbot';

export default function HolidayChatbotWidget() {
  const [open, setOpen] = useState(false);
  const { messages, loading, sendMessage, reset } = useHolidayChatbot();
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
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 left-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/90 to-teal-600/90 shadow-lg shadow-emerald-500/20 transition-all duration-300 hover:scale-110 hover:shadow-emerald-500/30 active:scale-95"
        title="Holiday Control Assistant"
      >
        <Calendar className="h-6 w-6 text-white" />
        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 ring-2 ring-[#07111a]">
          <Sparkles className="h-2.5 w-2.5 text-[#07111a]" />
        </span>
      </button>

      {open && (
        <div className="fixed bottom-20 left-6 z-50 flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-xl border border-emerald-500/30 bg-[#08141e] shadow-2xl sm:w-96">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#1b4052]/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500/15">
                <Calendar className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Holiday Control</p>
                <p className="text-[10px] text-gray-300">AI-powered office holiday manager</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={reset}
                className="rounded-md px-2 py-1 text-[10px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/10"
                title="Reset conversation"
              >
                Reset
              </button>
              <button
                onClick={() => setOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-md text-gray-300 transition-colors hover:bg-emerald-500/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-emerald-500/15 text-emerald-100'
                      : 'bg-[#0d1e28] text-gray-200'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-[#0d1e28] px-3 py-2">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick suggestions */}
          {messages.length <= 1 && (
            <div className="border-t border-[#1b4052]/60 px-3 py-2">
              <div className="flex flex-wrap gap-1.5">
                {['Tomorrow office is closed', 'Show upcoming office holidays', 'કાલે office બંધ છે'].map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    disabled={loading}
                    className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-[10px] font-medium text-emerald-200 transition-all duration-200 hover:scale-105 hover:bg-emerald-500/10 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-[#1b4052]/80 p-3">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type a holiday command..."
                disabled={loading}
                className="flex-1 rounded-lg border border-[#1b4052]/80 bg-[#091820]/70 px-3 py-2 text-xs text-white outline-none focus:border-emerald-400/60 disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/80 text-white transition-all duration-200 hover:scale-110 hover:bg-emerald-500 active:scale-95 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-gray-300">Type "yes" to confirm holiday actions. Only Viraj can manage holidays.</p>
          </div>
        </div>
      )}
    </>
  );
}
