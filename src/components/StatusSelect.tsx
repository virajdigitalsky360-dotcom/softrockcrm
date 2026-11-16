import { supabase } from '@/lib/supabase';
import type { Task, TaskStatus } from '@/lib/types';
import { statusLabel } from './ui';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

const STATUSES: TaskStatus[] = ['not_started', 'started', 'in_progress', 'in_approval', 'approved', 'not_approved'];

const colors: Record<string, string> = {
  not_started: 'bg-slate-100 text-slate-700 border-slate-200',
  started: 'bg-amber-50 text-amber-700 border-amber-100',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-100',
  in_approval: 'bg-sky-50 text-sky-700 border-sky-100',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  not_approved: 'bg-rose-50 text-rose-700 border-rose-100',
};

export default function StatusSelect({ task, disabled, onChanged }: { task: Task; disabled?: boolean; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);

  async function change(s: TaskStatus) {
    setOpen(false);
    if (s === task.status) return;
    await supabase.from('tasks').update({ status: s }).eq('id', task.id);
    onChanged?.();
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all duration-200 ${colors[task.status]} ${disabled ? 'opacity-60 cursor-default' : 'hover:shadow-md hover:shadow-current/20 hover:brightness-105'}`}
      >
        {statusLabel[task.status]}
        {!disabled && <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-36 rounded-lg border border-[#e5ebf3] bg-white p-1 shadow-xl">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => change(s)}
                className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-xs font-medium transition hover:bg-[#f3f7fc] ${colors[s]} ${s === task.status ? 'ring-1 ring-[#1478d4]/20' : ''}`}
              >
                {statusLabel[s]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
