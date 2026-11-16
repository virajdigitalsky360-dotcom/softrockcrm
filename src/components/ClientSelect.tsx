import { useEffect, useMemo, useRef, useState } from 'react';
import type { Client } from '@/lib/types';
import { Building2, ChevronDown, Search, X } from 'lucide-react';

interface Props {
  clients: Client[];
  value: string;
  onChange: (clientId: string) => void;
  label?: string;
}

export default function ClientSelect({ clients, value, onChange, label }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => clients.find((c) => c.id === value) ?? null, [clients, value]);

  const filtered = useMemo(() => {
    if (!query.trim()) return clients;
    const q = query.toLowerCase();
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q),
    );
  }, [clients, query]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={containerRef} className="block">
      {label && <span className="mb-1.5 block text-xs font-medium text-[#3d5070]">{label}</span>}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-[#dbe5f0] bg-white px-3 py-2 text-sm text-[#17243d] outline-none transition hover:border-[#1478d4]/40 focus:border-[#1478d4]"
        >
          <span className="flex items-center gap-2 truncate">
            {selected ? (
              <>
                <Building2 className="h-3.5 w-3.5 shrink-0 text-[#1478d4]" />
                <span className="truncate">{selected.name}</span>
              </>
            ) : (
              <span className="text-[#3d5070]">No client</span>
            )}
          </span>
          <span className="flex items-center gap-1">
            {selected && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); pick(''); }}
                className="grid h-4 w-4 place-items-center rounded text-[#3d5070] hover:bg-[#eef5fc] hover:text-[#17243d]"
              >
                <X className="h-3 w-3" />
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5 text-[#3d5070]" />
          </span>
        </button>

        {open && (
          <div className="absolute z-30 mt-1 w-full rounded-lg border border-[#e5ebf3] bg-white p-1.5 shadow-xl">
            <div className="mb-1 flex items-center gap-2 rounded-md border border-[#e5ebf3] bg-[#fbfcfe] px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 text-[#3d5070]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clients..."
                className="w-full bg-transparent text-sm text-[#17243d] outline-none placeholder:text-[#3d5070]"
              />
            </div>
            <div className="max-h-52 overflow-y-auto">
              <button
                type="button"
                onClick={() => pick('')}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition hover:bg-[#f3f7fc] ${!value ? 'bg-[#eef5fc] text-[#1478d4] font-medium' : 'text-[#3d5070]'}`}
              >
                No client
              </button>
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition hover:bg-[#f3f7fc] ${c.id === value ? 'bg-[#eef5fc] text-[#1478d4] font-medium' : 'text-[#405572]'}`}
                >
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-[#1478d4]/60" />
                  <span className="flex-1 truncate text-left">{c.name}</span>
                  {c.email && <span className="truncate text-[11px] text-[#3d5070]">{c.email}</span>}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-2.5 py-3 text-center text-xs text-[#3d5070]">No clients found</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
