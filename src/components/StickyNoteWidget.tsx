import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { StickyNote } from 'lucide-react';

export default function StickyNoteWidget() {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [noteId, setNoteId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('sticky_notes')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setNoteId(data.id);
        setContent(data.content ?? '');
      } else {
        // create blank note
        const { data: created } = await supabase
          .from('sticky_notes')
          .insert({ user_id: user.id, content: '' })
          .select()
          .maybeSingle();
        if (created) setNoteId(created.id);
      }
      setLoaded(true);
    })();
  }, [user]);

  // autosave with debounce
  useEffect(() => {
    if (!loaded || !noteId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await supabase
        .from('sticky_notes')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', noteId);
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [content, noteId, loaded]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-400/10 to-yellow-500/5 p-5">
      <div className="mb-3 flex items-center gap-2">
        <StickyNote className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-800">Sticky Note</h3>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write quick notes here..."
        className="h-40 w-full resize-none bg-transparent text-sm text-amber-900 outline-none placeholder:text-amber-800/60"
      />
      <p className="mt-1 text-right text-[11px] font-medium text-amber-800/80">Auto-saved</p>
    </div>
  );
}
