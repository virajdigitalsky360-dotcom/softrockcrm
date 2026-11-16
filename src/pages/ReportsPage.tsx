import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useTasks, useClients, useTeamMembers, useWorkspaces } from '@/lib/hooks';
import { Card, PageLoader, EmptyState, Button, Select, Input, StatusBadge } from '@/components/ui';
import { FileSpreadsheet, FileText, Filter, FileBarChart, Lock } from 'lucide-react';

function fmtDate(d: string | null) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtDateTime(d: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const statusLabel: Record<string, string> = {
  not_started: 'Not Started',
  started: 'Started',
  in_progress: 'In Progress',
  in_approval: 'In Approval',
  approved: 'Approved',
  not_approved: 'Not Approved',
};

export default function ReportsPage() {
  const { user } = useAuth();
  const canExport = (user?.email ?? '').toLowerCase() === 'viraj.digitalsky360@gmail.com';
  const { workspaces } = useWorkspaces();
  const { members } = useTeamMembers();
  const { clients } = useClients();

  const [fPerson, setFPerson] = useState('');
  const [fWorkspace, setFWorkspace] = useState('');
  const [fClient, setFClient] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { tasks, loading } = useTasks({
    teamMemberId: fPerson || null,
    workspaceId: fWorkspace || null,
    clientId: fClient || null,
    status: fStatus || null,
  });

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (fromDate && t.due_date && t.due_date < fromDate) return false;
      if (toDate && t.due_date && t.due_date > toDate) return false;
      return true;
    });
  }, [tasks, fromDate, toDate]);

  async function exportExcel() {
    const { data: allowed } = await supabase.rpc('can_export_reports');
    if (!allowed) { alert('Only the Primary Master can export reports.'); return; }
    const rows = filtered.map((t) => ({
      Task: t.name,
      Person: t.team_member?.name ?? 'Unassigned',
      Workspace: t.workspace?.name ?? '',
      Client: t.client?.name ?? '',
      Status: statusLabel[t.status] ?? t.status,
      'Due Date': fmtDate(t.due_date),
      'Created Date': fmtDateTime(t.created_at),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `SOFTROCK_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function exportPDF() {
    const { data: allowed } = await supabase.rpc('can_export_reports');
    if (!allowed) { alert('Only the Primary Master can export reports.'); return; }
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text('SOFTROCK — Task Report', 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Generated ${new Date().toLocaleString()}`, 14, 22);
    autoTable(doc, {
      startY: 26,
      head: [['Task', 'Person', 'Workspace', 'Client', 'Status', 'Due Date', 'Created']],
      body: filtered.map((t) => [
        t.name,
        t.team_member?.name ?? 'Unassigned',
        t.workspace?.name ?? '',
        t.client?.name ?? '',
        statusLabel[t.status] ?? t.status,
        fmtDate(t.due_date),
        fmtDateTime(t.created_at),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [20, 120, 212], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });
    doc.save(`SOFTROCK_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-[#17243d]">
            <FileBarChart className="h-5 w-5 text-[#1478d4]" /> Reports
          </h1>
          <p className="text-sm text-[#5a6c84]">{filtered.length} tasks match the current filters</p>
        </div>
        <div className="flex gap-2">
          {canExport ? (
            <>
              <Button variant="subtle" onClick={exportExcel} disabled={filtered.length === 0}>
                <FileSpreadsheet className="h-4 w-4" /> Export Excel
              </Button>
              <Button variant="subtle" onClick={exportPDF} disabled={filtered.length === 0}>
                <FileText className="h-4 w-4" /> Export PDF
              </Button>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5ebf3] bg-[#fbfcfe] px-3 py-2 text-xs text-[#5a6c84]">
              <Lock className="h-3.5 w-3.5" /> Export restricted to Primary Master
            </span>
          )}
        </div>
      </div>

      {/* filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Filter className="h-4 w-4 text-[#3d5070] self-center" />
          <div className="min-w-[120px] flex-1">
            <Select value={fPerson} onChange={(e) => setFPerson(e.target.value)}>
              <option value="">All People</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </div>
          <div className="min-w-[120px] flex-1">
            <Select value={fWorkspace} onChange={(e) => setFWorkspace(e.target.value)}>
              <option value="">All Workspaces</option>
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </div>
          <div className="min-w-[120px] flex-1">
            <Select value={fClient} onChange={(e) => setFClient(e.target.value)}>
              <option value="">All Clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="min-w-[120px] flex-1">
            <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="not_started">Not Started</option>
              <option value="started">Started</option>
              <option value="in_progress">In Progress</option>
              <option value="in_approval">In Approval</option>
              <option value="approved">Approved</option>
              <option value="not_approved">Not Approved</option>
            </Select>
          </div>
          <div className="min-w-[140px] flex-1">
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} placeholder="From" />
          </div>
          <div className="min-w-[140px] flex-1">
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} placeholder="To" />
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card><EmptyState title="No tasks match these filters" /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#edf1f6] text-left text-xs text-[#5a6c84]">
                  <th className="px-4 py-3 font-medium">Task</th>
                  <th className="px-4 py-3 font-medium">Person</th>
                  <th className="px-4 py-3 font-medium">Workspace</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Due Date</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1f6]">
                {filtered.map((t) => (
                  <tr key={t.id} className="transition-all duration-200 hover:bg-[#f8fbff]">
                    <td className="px-4 py-3 font-medium text-[#17243d]">{t.name}</td>
                    <td className="px-4 py-3 text-[#405572]">{t.team_member?.name ?? 'Unassigned'}</td>
                    <td className="px-4 py-3 text-[#5a6c84]">{t.workspace?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-[#405572]">{t.client?.name ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-3 text-[#5a6c84]">{fmtDate(t.due_date)}</td>
                    <td className="px-4 py-3 text-[11px] font-medium text-[#3d5070]">{fmtDate(t.created_at.slice(0, 10))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
