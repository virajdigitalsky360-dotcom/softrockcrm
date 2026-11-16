import { useState, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useClients, useTasks } from '@/lib/hooks';
import type { Client } from '@/lib/types';
import { Card, PageLoader, EmptyState, Button, Input, Textarea, Modal, StatusBadge } from '@/components/ui';
import { Plus, Pencil, Trash2, Building2, Mail, Phone, FileText, Eye, CalendarDays } from 'lucide-react';

function fmtDate(d: string | null) {
  if (!d) return 'No due date';
  const today = new Date();
  const dt = new Date(d + 'T00:00:00');
  const todayD = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (dt.getTime() === todayD.getTime()) return 'Today';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ClientsPage() {
  const { isViewOnly } = useAuth();
  const { clients, loading, reload } = useClients();
  const { tasks } = useTasks();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [viewing, setViewing] = useState<Client | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openNew() {
    setEditing(null); setName(''); setEmail(''); setPhone(''); setNotes('');
    setError(null); setModalOpen(true);
  }
  function openEdit(c: Client) {
    setEditing(c); setName(c.name); setEmail(c.email ?? ''); setPhone(c.phone ?? ''); setNotes(c.notes ?? '');
    setError(null); setModalOpen(true);
  }
  function openView(c: Client) {
    setViewing(c);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Client name is required'); return; }
    setBusy(true); setError(null);
    const payload = { name: name.trim(), email: email || null, phone: phone || null, notes: notes.trim() || null };
    const res = editing
      ? await supabase.from('clients').update(payload).eq('id', editing.id)
      : await supabase.from('clients').insert(payload);
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    setModalOpen(false);
    reload();
  }

  async function remove(c: Client) {
    if (!confirm(`Delete client "${c.name}"? Tasks will keep their client field cleared.`)) return;
    await supabase.from('clients').delete().eq('id', c.id);
    reload();
  }

  if (loading) return <PageLoader />;

  const viewingTasks = viewing ? tasks.filter((t) => t.client_id === viewing.id) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#17243d]">Clients</h1>
          <p className="text-sm text-[#5a6c84]">{clients.length} clients</p>
        </div>
        {!isViewOnly && <Button onClick={openNew}><Plus className="h-4 w-4" /> Add Client</Button>}
      </div>

      {clients.length === 0 ? (
        <Card><EmptyState title="No clients yet" hint={isViewOnly ? undefined : 'Click Add Client to create one.'} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => {
            const count = tasks.filter((t) => t.client_id === c.id).length;
            return (
              <Card key={c.id} className="group p-4 transition-all duration-200 hover:-translate-y-1 hover:border-[#1478d4]/30 hover:shadow-lg hover:scale-[1.02]">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <button
                    onClick={() => openView(c)}
                    className="flex items-center gap-2.5 text-left transition hover:opacity-80"
                  >
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8f1fb]">
                      <Building2 className="h-5 w-5 text-[#1478d4]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#17243d]">{c.name}</h3>
                      <p className="text-[11px] text-[#5a6c84]">{count} task{count !== 1 ? 's' : ''}</p>
                    </div>
                  </button>
                  <div className="flex gap-1">
                    <button onClick={() => openView(c)} className="grid h-7 w-7 place-items-center rounded-lg text-[#3d5070] transition-all duration-200 hover:bg-[#eef5fc] hover:text-[#1478d4] hover:scale-110 active:scale-95" title="View details">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    {!isViewOnly && (
                      <div className="flex gap-1 opacity-0 transition-all duration-200 group-hover:opacity-100">
                        <button onClick={() => openEdit(c)} className="grid h-7 w-7 place-items-center rounded-lg text-[#3d5070] transition-all duration-200 hover:bg-[#eef5fc] hover:text-[#1478d4] hover:scale-110 active:scale-95">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => remove(c)} className="grid h-7 w-7 place-items-center rounded-lg text-[#3d5070] transition-all duration-200 hover:bg-rose-50 hover:text-rose-600 hover:scale-110 active:scale-95">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5 text-xs text-[#5a6c84]">
                  {c.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-[#3d5070]" /> {c.email}</div>}
                  {c.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-[#3d5070]" /> {c.phone}</div>}
                  {c.notes && <div className="mt-2 line-clamp-2 text-[#5a6c84]">{c.notes}</div>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Client' : 'Add Client'}>
        <form onSubmit={save} className="space-y-4">
          <Input label="Client Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ABC Hospital" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      {/* Details modal */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Client Details" maxWidth="max-w-xl">
        {viewing && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#e8f1fb]">
                <Building2 className="h-6 w-6 text-[#1478d4]" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#17243d]">{viewing.name}</h3>
                <p className="text-xs text-[#5a6c84]">{viewingTasks.length} task{viewingTasks.length !== 1 ? 's' : ''}</p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              {viewing.email && (
                <div className="flex items-center gap-2 text-[#405572]"><Mail className="h-4 w-4 text-[#3d5070]" /> {viewing.email}</div>
              )}
              {viewing.phone && (
                <div className="flex items-center gap-2 text-[#405572]"><Phone className="h-4 w-4 text-[#3d5070]" /> {viewing.phone}</div>
              )}
              {viewing.notes && (
                <div className="rounded-lg border border-[#e5ebf3] bg-[#fbfcfe] p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[#3d5070]"><FileText className="h-3.5 w-3.5" /> Notes</div>
                  <p className="text-sm text-[#405572]">{viewing.notes}</p>
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#3d5070]">Tasks</h4>
              {viewingTasks.length === 0 ? (
                <p className="py-3 text-center text-xs text-[#3d5070]">No tasks linked to this client</p>
              ) : (
                <div className="max-h-60 space-y-2 overflow-y-auto">
                  {viewingTasks.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#edf1f6] bg-[#fbfcfe] px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#17243d]">{t.name}</p>
                        <p className="flex items-center gap-1 text-[11px] text-[#5a6c84]">
                          <CalendarDays className="h-3 w-3" /> {fmtDate(t.due_date)}
                        </p>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {!isViewOnly && (
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => { const c = viewing; setViewing(null); if (c) openEdit(c); }}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              )}
              <Button variant="ghost" onClick={() => setViewing(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
