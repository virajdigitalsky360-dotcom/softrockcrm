import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Card, EmptyState, Button } from '@/components/ui';
import { parseAttendanceText, type ParseResult, type EmployeeSummary } from '@/lib/parseAttendanceReport';
import {
  UploadCloud, FileText, AlertTriangle, BarChart3, Download, Trash2,
  Check, X, FileSpreadsheet, CalendarDays, Filter, ChevronDown, ChevronRight,
} from 'lucide-react';

interface SavedReport {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string | null;
  report_month: string | null;
  status: string;
  created_at: string;
  summary: ParseResult | null;
}

const ACCEPTED_EXTENSIONS = ['.txt', '.csv', '.xlsx', '.xls', '.pdf'];
const MAX_FILE_SIZE = 25 * 1024 * 1024;

function detectFileType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.txt')) return 'txt';
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
  if (lower.endsWith('.pdf')) return 'pdf';
  return 'unknown';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getWorkingDays(year: number, month: number): number {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let working = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month, d).getDay();
    if (dow !== 0) working++; // exclude Sundays
  }
  return working;
}

export default function AttendanceReportsPage() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadReports(); }, []);

  async function loadReports() {
    setLoadingReports(true);
    const { data } = await supabase
      .from('monthly_attendance_reports')
      .select('id, file_name, file_type, file_size, storage_path, report_month, status, created_at, summary')
      .order('created_at', { ascending: false });
    setSavedReports((data ?? []) as unknown as SavedReport[]);
    setLoadingReports(false);
  }

  function handleFileSelected(selectedFile: File | null) {
    if (!selectedFile) return;
    const fileType = detectFileType(selectedFile.name);
    if (fileType === 'unknown') {
      setError(`Unsupported file type. Please upload one of: ${ACCEPTED_EXTENSIONS.join(', ')}`);
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError(`File is too large (${formatBytes(selectedFile.size)}). Maximum is ${formatBytes(MAX_FILE_SIZE)}.`);
      return;
    }
    setFile(selectedFile);
    setError(null);
    setParseResult(null);
    setImported(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) handleFileSelected(droppedFile);
  }

  function clearFile() {
    setFile(null);
    setParseResult(null);
    setError(null);
    setImported(false);
    setParseProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function analyzeFile() {
    if (!file) return;
    const fileType = detectFileType(file.name);
    if (fileType !== 'txt' && fileType !== 'csv') {
      setError(`File type "${fileType}" is accepted for upload, but only TXT and CSV files can be parsed in-browser. XLSX and PDF files will be stored as-is.`);
      setParseResult(null);
      return;
    }
    setParsing(true);
    setParseProgress(10);
    setError(null);
    try {
      const text = await file.text();
      setParseProgress(40);
      const result = parseAttendanceText(text);
      setParseProgress(90);

      // Validation: reject only if zero rows were parsed at all
      if (result.totalParsed === 0 && result.needsReview.length === 0) {
        setError('No attendance data could be parsed from this file. The file format may not be supported or the file may not contain attendance information.');
        setParseResult(null);
        setParsing(false);
        return;
      }

      setParseResult(result);
      setParseProgress(100);
    } catch {
      setError('Could not read the file. It may be corrupted or encoded in an unsupported format.');
    }
    setParsing(false);
  }

  async function importReport() {
    if (!file || !user) return;
    setImporting(true);
    setError(null);
    try {
      const fileType = detectFileType(file.name);
      const storagePath = `${user.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('attendance-reports').upload(storagePath, file, { cacheControl: '3600', upsert: false });
      if (uploadError) { setError('Failed to store the file: ' + uploadError.message); setImporting(false); return; }

      const summary = parseResult ? {
        totals: parseResult.totals,
        employees: parseResult.employees,
        needsReview: parseResult.needsReview,
        detectedMonth: parseResult.detectedMonth,
        totalParsed: parseResult.totalParsed,
      } : null;

      const { error: dbError } = await supabase.from('monthly_attendance_reports').insert({
        uploaded_by: user.id,
        file_name: file.name,
        file_type: fileType,
        file_size: file.size,
        storage_path: storagePath,
        report_month: parseResult?.detectedMonth ?? null,
        summary,
        raw_parsed: parseResult ? { rows: parseResult.rows } : null,
        status: parseResult ? (parseResult.needsReview.length > 0 ? 'needs_review' : 'parsed') : 'parsed',
      });
      if (dbError) { setError('Failed to save report: ' + dbError.message); setImporting(false); return; }

      setImported(true);
      setImporting(false);
      clearFile();
      loadReports();
    } catch {
      setError('An unexpected error occurred during import.');
      setImporting(false);
    }
  }

  async function downloadReport(report: SavedReport) {
    if (!report.storage_path) { setError('No file is stored for this report.'); return; }
    const { data, error: downloadError } = await supabase.storage
      .from('attendance-reports')
      .download(report.storage_path);
    if (downloadError || !data) {
      setError(downloadError?.message ?? 'Could not download the report.');
      return;
    }

    const objectUrl = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = report.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  }

  function downloadSummary(report: SavedReport) {
    if (!report.summary) return;
    const blob = new Blob([JSON.stringify(report.summary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = report.file_name.replace(/\.[^.]+$/, '') + '-summary.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function deleteReport(report: SavedReport) {
    if (!confirm(`Delete the report "${report.file_name}"? This removes the stored file and summary.`)) return;
    const { error: dbErr } = await supabase.from('monthly_attendance_reports').delete().eq('id', report.id);
    if (dbErr) { setError(dbErr.message); return; }
    loadReports();
  }

  // Filter logic
  const availableYears = Array.from(new Set(savedReports.map((r) => r.report_month?.slice(0, 4)).filter(Boolean))) as string[];
  const filteredReports = savedReports.filter((r) => {
    if (filterMonth !== 'all' && r.report_month?.slice(5, 7) !== filterMonth) return false;
    if (filterYear !== 'all' && r.report_month?.slice(0, 4) !== filterYear) return false;
    return true;
  });

  // Overall summary across all filtered reports
  const overallSummary = filteredReports.reduce(
    (acc, r) => {
      if (r.summary) {
        acc.present += r.summary.totals.present;
        acc.absent += r.summary.totals.absent;
        acc.excused += r.summary.totals.excused;
        acc.leave += r.summary.totals.leave;
        acc.halfDay += r.summary.totals.halfDay;
        acc.late += r.summary.totals.late;
      }
      return acc;
    },
    { present: 0, absent: 0, excused: 0, leave: 0, halfDay: 0, late: 0 },
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-[#17243d]">
          <FileSpreadsheet className="h-5 w-5 text-[#1478d4]" /> Attendance Reports
        </h1>
        <p className="text-sm text-[#5a6c84]">Upload, analyze, and manage monthly attendance reports.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><X className="h-4 w-4" /></button>
        </div>
      )}

      {imported && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
          <Check className="h-4 w-4 shrink-0" />
          <span>Report uploaded and saved successfully.</span>
          <button onClick={() => setImported(false)} className="ml-auto text-emerald-500 hover:text-emerald-700"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Upload area */}
      {!file && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
            dragging ? 'border-[#1478d4] bg-[#1478d4]/5 scale-[1.01]' : 'border-[#c7d6e8] bg-[#fbfcfe] hover:border-[#1478d4]/50 hover:bg-[#f0f7ff]'
          }`}
        >
          <div className={`grid h-16 w-16 place-items-center rounded-2xl transition-all duration-200 ${dragging ? 'bg-[#1478d4]/15 scale-110' : 'bg-[#eef5fc]'}`}>
            <UploadCloud className={`h-8 w-8 transition-colors ${dragging ? 'text-[#1478d4]' : 'text-[#5a6c84]'}`} />
          </div>
          <p className="mt-4 text-base font-semibold text-[#17243d]">{dragging ? 'Drop your file here' : 'Drag & Drop your attendance report here'}</p>
          <p className="mt-1 text-sm text-[#5a6c84]">or Browse from PC</p>
          <p className="mt-3 text-xs text-[#7088a8]">Supported: {ACCEPTED_EXTENSIONS.join(', ')} · Max {formatBytes(MAX_FILE_SIZE)}</p>
          <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTENSIONS.join(',')} onChange={(e) => handleFileSelected(e.target.files?.[0] ?? null)} className="hidden" />
        </div>
      )}

      {/* Selected file + analyze */}
      {file && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-[#e5ebf3] px-5 py-4">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#eef5fc]"><FileText className="h-5 w-5 text-[#1478d4]" /></div>
            <div className="flex-1">
              <p className="text-sm font-medium text-[#17243d]">{file.name}</p>
              <p className="text-xs text-[#5a6c84]">Type: <span className="font-medium uppercase">{detectFileType(file.name)}</span> · Size: <span className="font-medium">{formatBytes(file.size)}</span></p>
            </div>
            <button onClick={clearFile} className="grid h-8 w-8 place-items-center rounded-lg text-[#5a6c84] transition hover:bg-red-500/10 hover:text-red-600"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex items-center gap-3 px-5 py-4">
            <Button onClick={analyzeFile} disabled={parsing || importing}><BarChart3 className="h-3.5 w-3.5" />{parsing ? 'Analyzing...' : 'Upload / Analyze'}</Button>
            {parsing && (
              <div className="flex-1">
                <div className="h-2 overflow-hidden rounded-full bg-[#e5ebf3]"><div className="h-full rounded-full bg-[#1478d4] transition-all duration-300" style={{ width: `${parseProgress}%` }} /></div>
                <p className="mt-1 text-xs text-[#5a6c84]">Parsing report... {parseProgress}%</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Parse preview */}
      {parseResult && <ParsePreview result={parseResult} onImport={importReport} onCancel={clearFile} importing={importing} />}

      {/* Month/Year filter */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#e5ebf3] px-5 py-4">
          <Filter className="h-4 w-4 text-[#5a6c84]" />
          <span className="text-sm font-semibold text-[#17243d]">Filter Reports</span>
          <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="rounded-lg border border-[#e1e8f1] bg-white px-3 py-1.5 text-sm text-[#17243d] outline-none focus:border-[#1478d4]">
            <option value="all">All Months</option>
            {MONTHS.map((m, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
          </select>
          <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="rounded-lg border border-[#e1e8f1] bg-white px-3 py-1.5 text-sm text-[#17243d] outline-none focus:border-[#1478d4]">
            <option value="all">All Years</option>
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {(filterMonth !== 'all' || filterYear !== 'all') && (
            <button onClick={() => { setFilterMonth('all'); setFilterYear('all'); }} className="text-xs text-[#1478d4] hover:underline">Clear filter</button>
          )}
          <span className="ml-auto text-xs text-[#5a6c84]">{filteredReports.length} report{filteredReports.length !== 1 ? 's' : ''}</span>
        </div>
      </Card>

      {/* Overall summary across filtered reports */}
      {filteredReports.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[#e5ebf3] px-5 py-4">
            <h3 className="text-sm font-semibold text-[#17243d]">Overall Summary ({filteredReports.length} report{filteredReports.length !== 1 ? 's' : ''})</h3>
          </div>
          <div className="grid grid-cols-2 gap-px bg-[#edf1f6] sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Present', value: overallSummary.present, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Absent', value: overallSummary.absent, color: 'text-red-600', bg: 'bg-red-50' },
              { label: 'Excused', value: overallSummary.excused, color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: 'Leave', value: overallSummary.leave, color: 'text-sky-600', bg: 'bg-sky-50' },
              { label: 'Half Day', value: overallSummary.halfDay, color: 'text-purple-600', bg: 'bg-purple-50' },
              { label: 'Late', value: overallSummary.late, color: 'text-orange-600', bg: 'bg-orange-50' },
            ].map((stat) => (
              <div key={stat.label} className={`px-4 py-3 ${stat.bg}`}>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-[#5a6c84]">{stat.label}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Previous reports */}
      <Card className="overflow-hidden">
        <div className="border-b border-[#e5ebf3] px-5 py-4">
          <h3 className="text-sm font-semibold text-[#17243d]">Previous Uploaded Reports</h3>
        </div>
        {loadingReports ? (
          <div className="px-5 py-8 text-center text-sm text-[#5a6c84]">Loading...</div>
        ) : filteredReports.length === 0 ? (
          <EmptyState title="No reports found" hint={savedReports.length > 0 ? 'Try adjusting the filter.' : 'Upload a report to get started.'} />
        ) : (
          <div className="divide-y divide-[#edf1f6]">
            {filteredReports.map((r) => (
              <ReportRow
                key={r.id}
                report={r}
                expanded={expandedReport === r.id}
                onToggle={() => setExpandedReport(expandedReport === r.id ? null : r.id)}
                onDownload={downloadReport}
                onDownloadSummary={downloadSummary}
                onDelete={deleteReport}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ParsePreview({ result, onImport, onCancel, importing }: { result: ParseResult; onImport: () => void; onCancel: () => void; importing: boolean }) {
  const [year, month] = result.detectedMonth ? [parseInt(result.detectedMonth.slice(0, 4)), parseInt(result.detectedMonth.slice(5, 7)) - 1] : [new Date().getFullYear(), new Date().getMonth()];
  const workingDays = getWorkingDays(year, month);

  return (
    <div className="space-y-4">
      {/* Monthly summary */}
      <Card className="overflow-hidden">
        <div className="border-b border-[#e5ebf3] px-5 py-4">
          <h3 className="text-sm font-semibold text-[#17243d]">Monthly Attendance Summary {result.detectedMonth && `— ${result.detectedMonth}`}</h3>
          <p className="mt-0.5 text-xs text-[#5a6c84]">{result.totalParsed} rows parsed · Working days in month: {workingDays}</p>
        </div>
        <div className="grid grid-cols-2 gap-px bg-[#edf1f6] sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Present', value: result.totals.present, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Absent', value: result.totals.absent, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Excused', value: result.totals.excused, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Leave', value: result.totals.leave, color: 'text-sky-600', bg: 'bg-sky-50' },
            { label: 'Half Day', value: result.totals.halfDay, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Late', value: result.totals.late, color: 'text-orange-600', bg: 'bg-orange-50' },
          ].map((stat) => (
            <div key={stat.label} className={`px-4 py-3 ${stat.bg}`}>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-[#5a6c84]">{stat.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Employee-wise summary */}
      {result.employees.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[#e5ebf3] px-5 py-4">
            <h3 className="text-sm font-semibold text-[#17243d]">Employee-wise Summary</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e5ebf3] text-left text-xs text-[#5a6c84]">
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 text-center font-medium">Present</th>
                  <th className="px-4 py-3 text-center font-medium">Absent</th>
                  <th className="px-4 py-3 text-center font-medium">Excused</th>
                  <th className="px-4 py-3 text-center font-medium">Leave</th>
                  <th className="px-4 py-3 text-center font-medium">Working Days</th>
                  <th className="px-4 py-3 text-center font-medium">Attendance %</th>

                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1f6]">
                {result.employees.map((emp: EmployeeSummary) => (
                  <tr key={emp.name} className="transition-all duration-200 hover:bg-cyan-500/[0.04]">
                    <td className="px-4 py-3 font-medium text-[#17243d]">{emp.name}</td>
                    <td className="px-4 py-3 text-center text-emerald-600">{emp.present}</td>
                    <td className="px-4 py-3 text-center text-red-600">{emp.absent}</td>
                    <td className="px-4 py-3 text-center text-amber-600">{emp.excused}</td>
                    <td className="px-4 py-3 text-center text-sky-600">{emp.leave}</td>
                    <td className="px-4 py-3 text-center text-[#3d5070]">{emp.totalDays}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-semibold ${emp.attendancePercent >= 75 ? 'text-emerald-600' : emp.attendancePercent >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{emp.attendancePercent}%</span>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Needs review */}
      {result.needsReview.length > 0 && (
        <Card className="overflow-hidden border-amber-500/30">
          <div className="border-b border-amber-500/20 bg-amber-500/5 px-5 py-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-700"><AlertTriangle className="h-4 w-4" /> Needs Review ({result.needsReview.length})</h3>
            <p className="mt-0.5 text-xs text-amber-600">These rows could not be confidently matched. Review them manually before importing.</p>
          </div>
          <div className="divide-y divide-[#edf1f6]">
            {result.needsReview.map((row, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3">
                <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-700">{i + 1}</div>
                <div className="flex-1">
                  <p className="font-mono text-sm text-[#17243d]">{row.rawText}</p>
                  <p className="text-xs text-amber-600">{row.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Detailed parsed rows preview */}
      {result.rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[#e5ebf3] px-5 py-4">
            <h3 className="text-sm font-semibold text-[#17243d]">Parsed Attendance Records ({result.rows.length})</h3>
            <p className="mt-0.5 text-xs text-[#5a6c84]">Review each parsed record before importing. Each row shows the employee, date, status, and the original source text.</p>
          </div>
          <div className="max-h-[400px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#f5f8fc]">
                <tr className="border-b border-[#e5ebf3] text-left text-[10px] text-[#5a6c84]">
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Source Text</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1f6] bg-white">
                {result.rows.map((row, i) => (
                  <tr key={i} className="transition-all duration-150 hover:bg-cyan-500/[0.04]">
                    <td className="px-4 py-2 font-medium text-[#17243d]">{row.employeeName}</td>
                    <td className="px-4 py-2 text-[#5a6c84]">{row.date ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className={
                        row.status === 'present' ? 'text-emerald-600' :
                        row.status === 'absent' ? 'text-red-600' :
                        row.status === 'excused' ? 'text-amber-600' :
                        row.status === 'leave' ? 'text-sky-600' :
                        row.status === 'half_day' ? 'text-purple-600' :
                        row.status === 'late' ? 'text-orange-600' :
                        'text-[#5a6c84]'
                      }>{row.status}</span>
                    </td>
                    <td className="max-w-md truncate px-4 py-2 font-mono text-[10px] text-[#7088a8]" title={row.rawText}>{row.rawText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Import buttons */}
      <div className="flex items-center justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={onImport} disabled={importing || result.rows.length === 0}>
          {importing ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Check className="h-3.5 w-3.5" />}
          {importing ? 'Importing...' : 'Confirm & Import'}
        </Button>
      </div>
    </div>
  );
}

function ReportRow({ report, expanded, onToggle, onDownload, onDownloadSummary, onDelete }: {
  report: SavedReport;
  expanded: boolean;
  onToggle: () => void;
  onDownload: (r: SavedReport) => void;
  onDownloadSummary: (r: SavedReport) => void;
  onDelete: (r: SavedReport) => void;
}) {
  return (
    <div className="group">
      <div className="flex items-center gap-3 px-5 py-3 transition-all duration-200 hover:bg-cyan-500/[0.04]">
        <button onClick={onToggle} className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] transition hover:bg-[#eef5fc]">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#eef5fc]"><FileText className="h-4 w-4 text-[#1478d4]" /></div>
        <div className="flex-1">
          <p className="text-sm font-medium text-[#17243d]">{report.file_name}</p>
          <p className="text-xs text-[#5a6c84]">
            {report.file_type.toUpperCase()} · {formatBytes(report.file_size)} · Uploaded {new Date(report.created_at).toLocaleDateString()}
            {report.report_month && ` · Month: ${report.report_month}`}
            {report.status === 'needs_review' && <span className="ml-2 text-amber-600">· Needs Review</span>}
          </p>
        </div>
        {report.summary && (
          <div className="hidden items-center gap-3 text-xs sm:flex">
            <span className="text-emerald-600">P: {report.summary.totals.present}</span>
            <span className="text-red-600">A: {report.summary.totals.absent}</span>
            <span className="text-amber-600">E: {report.summary.totals.excused}</span>
          </div>
        )}
        <button onClick={() => onDownload(report)} className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] opacity-0 transition-all duration-200 hover:bg-[#1478d4]/10 hover:text-[#1478d4] group-hover:opacity-100" title="Download original file"><Download className="h-3.5 w-3.5" /></button>
        {report.summary && <button onClick={() => onDownloadSummary(report)} className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] opacity-0 transition-all duration-200 hover:bg-[#1478d4]/10 hover:text-[#1478d4] group-hover:opacity-100" title="Download summary"><BarChart3 className="h-3.5 w-3.5" /></button>}
        <button onClick={() => onDelete(report)} className="grid h-7 w-7 place-items-center rounded-lg text-[#5a6c84] opacity-0 transition-all duration-200 hover:bg-red-500/10 hover:text-red-600 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>

      {/* Expanded detail view */}
      {expanded && report.summary && (
        <div className="space-y-4 border-t border-[#edf1f6] bg-[#fbfcfe] px-5 py-4">
          {/* Monthly summary */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#5a6c84]"><CalendarDays className="h-3.5 w-3.5" /> Monthly Summary {report.report_month && `— ${report.report_month}`}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {[
                { label: 'Present', value: report.summary.totals.present, color: 'text-emerald-600' },
                { label: 'Absent', value: report.summary.totals.absent, color: 'text-red-600' },
                { label: 'Excused', value: report.summary.totals.excused, color: 'text-amber-600' },
                { label: 'Leave', value: report.summary.totals.leave, color: 'text-sky-600' },
                { label: 'Half Day', value: report.summary.totals.halfDay, color: 'text-purple-600' },
                { label: 'Late', value: report.summary.totals.late, color: 'text-orange-600' },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-[#e5ebf3] bg-white px-3 py-2 text-center">
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-[#5a6c84]">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Employee-wise table */}
          {report.summary.employees.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-[#e5ebf3]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#e5ebf3] bg-[#f5f8fc] text-left text-[10px] text-[#5a6c84]">
                    <th className="px-3 py-2 font-medium">Employee</th>
                    <th className="px-3 py-2 text-center font-medium">Present</th>
                    <th className="px-3 py-2 text-center font-medium">Absent</th>
                    <th className="px-3 py-2 text-center font-medium">Excused</th>
                    <th className="px-3 py-2 text-center font-medium">Days</th>
                    <th className="px-3 py-2 text-center font-medium">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1f6] bg-white">
                  {report.summary.employees.map((emp: EmployeeSummary) => (
                    <tr key={emp.name}>
                      <td className="px-3 py-2 font-medium text-[#17243d]">{emp.name}</td>
                      <td className="px-3 py-2 text-center text-emerald-600">{emp.present}</td>
                      <td className="px-3 py-2 text-center text-red-600">{emp.absent}</td>
                      <td className="px-3 py-2 text-center text-amber-600">{emp.excused}</td>
                      <td className="px-3 py-2 text-center text-[#3d5070]">{emp.totalDays}</td>
                      <td className="px-3 py-2 text-center font-semibold">{emp.attendancePercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Needs review */}
          {report.summary.needsReview.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Needs Review ({report.summary.needsReview.length})</p>
              <div className="space-y-1">
                {report.summary.needsReview.map((row, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="font-bold text-amber-600">{i + 1}.</span>
                    <div><span className="font-mono text-[#17243d]">{row.rawText}</span> <span className="text-amber-600">— {row.reason}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Download buttons */}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => onDownload(report)}><Download className="h-3 w-3" /> Original File</Button>
            <Button size="sm" variant="ghost" onClick={() => onDownloadSummary(report)}><BarChart3 className="h-3 w-3" /> Calculated Summary</Button>
          </div>
        </div>
      )}
    </div>
  );
}
