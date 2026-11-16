import { useState, useEffect, useRef } from 'react';
import { Lock, AlertTriangle, Send, Upload, X, ShieldCheck, ShieldAlert, Camera } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  uploadScreenshot,
  REASONS_REQUIRING_SCREENSHOT,
  REASONS_REQUIRING_EXPLANATION,
  type AbsentReason,
} from '@/lib/useAbsentLock';

const VIRAJ_EMAIL = 'viraj.digitalsky360@gmail.com';
const KAPIL_EMAIL = 'kapilprajapati9054@gmail.com';

const REASONS: { value: AbsentReason; label: string; desc: string }[] = [
  { value: 'crm_down', label: 'CRM was down', desc: 'The CRM system was not working or inaccessible' },
  { value: 'no_task_assigned', label: 'No task was assigned to me', desc: 'No task was assigned to me for today' },
  { value: 'forgot_to_add_task', label: 'I forgot to add the task', desc: 'I forgot to add my task in the CRM' },
  { value: 'other', label: 'Other', desc: 'Something else happened' },
];

function istDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function istTime(): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}

export default function AbsentLockScreen({ onSubmitted }: { onSubmitted: () => void }) {
  const { user, profile } = useAuth();
  const [selected, setSelected] = useState<AbsentReason | ''>('');
  const [explanation, setExplanation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskCount, setTaskCount] = useState<number>(0);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotUploading, setScreenshotUploading] = useState(false);
  const [uploadedScreenshotPath, setUploadedScreenshotPath] = useState<string | null>(null);
  const [arrivalTime, setArrivalTime] = useState('');
  const [crmDownResult, setCrmDownResult] = useState<{ verified: boolean; details: string } | null>(null);
  const [crmDownChecking, setCrmDownChecking] = useState(false);
  const [previousCrmDownRejected, setPreviousCrmDownRejected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = istDate();
  const nowTime = istTime();
  const employeeName = profile?.display_name || profile?.email?.split('@')[0] || 'Employee';

  const needsScreenshot = !!selected && REASONS_REQUIRING_SCREENSHOT.includes(selected);
  const needsExplanation = !!selected && REASONS_REQUIRING_EXPLANATION.includes(selected);
  const isCrmDown = selected === 'crm_down';

  useEffect(() => {
    async function loadTaskCount() {
      if (!profile?.team_member_id) return;
      const { count } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('due_date', today)
        .eq('team_member_id', profile.team_member_id);
      setTaskCount(count ?? 0);
    }
    loadTaskCount();
  }, [profile?.team_member_id, today]);

  useEffect(() => {
    async function loadPreviousSubmission() {
      if (!user) return;
      const { data } = await supabase
        .from('absent_reason_submissions')
        .select('reason, crm_down_verified')
        .eq('user_id', user.id)
        .eq('attendance_date', today)
        .maybeSingle();
      if (data?.reason === 'crm_down' && data.crm_down_verified === 'not_verified') {
        setPreviousCrmDownRejected(true);
      }
    }
    loadPreviousSubmission();
  }, [user, today]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Screenshot must be under 10 MB.');
      return;
    }
    setScreenshotFile(file);
    setScreenshotPreview(URL.createObjectURL(file));
    setError(null);
  }

  function clearScreenshot() {
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setUploadedScreenshotPath(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function verifyCrmDown(): Promise<{ verified: boolean; details: string }> {
    // Check if there were any recent system alerts about CRM being down
    const todayStart = new Date(today + 'T00:00:00+05:30').toISOString();
    const nowISO = new Date().toISOString();
    const { data: alerts } = await supabase
      .from('system_alerts')
      .select('severity, title, message, created_at')
      .gte('created_at', todayStart)
      .lte('created_at', nowISO)
      .order('created_at', { ascending: false })
      .limit(5);

    const crmAlerts = (alerts ?? []).filter(a =>
      (a.message || '').toLowerCase().includes('crm') ||
      (a.title || '').toLowerCase().includes('crm') ||
      (a.title || '').toLowerCase().includes('downtime')
    );

    const details = {
      checkedAt: nowISO,
      systemAlerts: crmAlerts.length,
      alertDetails: crmAlerts.map(a => ({ title: a.title, message: a.message, created_at: a.created_at })),
    };

    // CRM is considered "verified down" if there are CRM-related system alerts
    const verified = crmAlerts.length > 0;

    return { verified, details: JSON.stringify(details) };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) { setError('Please select a reason.'); return; }
    if (!user) { setError('Not signed in.'); return; }

    const reason = selected as AbsentReason;

    // If explanation is required for this reason, validate it
    if (REASONS_REQUIRING_EXPLANATION.includes(reason) && !explanation.trim()) {
      setError('An explanation is required for this reason. Please provide details.');
      return;
    }

    // If screenshot is required, upload it first
    let screenshotPath: string | null = null;
    if (REASONS_REQUIRING_SCREENSHOT.includes(reason)) {
      if (!screenshotFile && !uploadedScreenshotPath) {
        setError('A screenshot is mandatory for this reason. Please upload proof.');
        return;
      }
      if (screenshotFile && !uploadedScreenshotPath) {
        setScreenshotUploading(true);
        setError(null);
        const { storagePath, error: uploadError } = await uploadScreenshot(user.id, screenshotFile);
        setScreenshotUploading(false);
        if (uploadError || !storagePath) {
          setError('Failed to upload screenshot. Please try again.');
          return;
        }
        screenshotPath = storagePath;
        setUploadedScreenshotPath(storagePath);
      } else {
        screenshotPath = uploadedScreenshotPath;
      }
    }

    // If CRM was down, perform verification
    let crmDownVerified: 'verified' | 'not_verified' | 'pending' | null = null;
    let verificationDetails: string | null = null;
    let verificationTimestamp: string | null = null;

    if (reason === 'crm_down') {
      setCrmDownChecking(true);
      setError(null);
      const result = await verifyCrmDown();
      setCrmDownChecking(false);
      crmDownVerified = result.verified ? 'verified' : 'not_verified';
      verificationDetails = result.details;
      verificationTimestamp = new Date().toISOString();
      setCrmDownResult({ verified: result.verified, details: result.verified ? 'CRM Down — Verified' : 'CRM Down — Not Verified' });
    }

    setSubmitting(true);
    setError(null);

    // Submit with screenshot and verification data
    // Use upsert to handle re-submission (unique constraint on user_id + attendance_date)
    const { error: submitError } = await supabase
      .from('absent_reason_submissions')
      .upsert({
        user_id: user.id,
        team_member_id: profile?.team_member_id ?? null,
        attendance_date: today,
        reason,
        explanation: explanation.trim() || null,
        screenshot_url: screenshotPath,
        arrival_time: arrivalTime || null,
        crm_down_verified: crmDownVerified,
        verification_details: verificationDetails ? JSON.parse(verificationDetails) : null,
        verification_timestamp: verificationTimestamp,
      }, { onConflict: 'user_id,attendance_date' });

    if (submitError) {
      setError(submitError.message);
      setSubmitting(false);
      return;
    }

    // Send email notification to Viraj + Kapil
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const sendUrl = `${supabaseUrl}/functions/v1/send-email`;
      const reasonLabel = REASONS.find((r) => r.value === reason)?.label ?? reason;
      const verificationLine = crmDownVerified
        ? `<tr><td style="color:#666;">Verification:</td><td><strong style="color:${crmDownVerified === 'verified' ? '#16a34a' : '#dc2626'};">${crmDownVerified === 'verified' ? 'CRM Down — Verified' : 'CRM Down — Not Verified'}</strong></td></tr>`
        : '';
      const screenshotLine = screenshotPath
        ? `<tr><td style="color:#666;">Screenshot:</td><td><strong>Uploaded</strong></td></tr>`
        : '';
      const arrivalLine = arrivalTime
        ? `<tr><td style="color:#666;">Arrival Time:</td><td><strong>${arrivalTime}</strong></td></tr>`
        : '';
      const noteLine = '<tr><td style="color:#666;">Note:</td><td><strong>Attendance remains ABSENT until a Master verifies the proof.</strong></td></tr>';
      const subject = isCrmDown
        ? `SOFTROCK — CRM Down Report: ${employeeName} — ${today}`
        : `SOFTROCK — Absent Reason: ${employeeName} — ${today}`;
      const introLine = isCrmDown
        ? 'An employee has reported that the CRM was down/unavailable.'
        : 'An employee has submitted a reason for their absence.';
      const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <h2 style="color:#1a1a2e;">SOFTROCK — ${isCrmDown ? 'CRM Down Report' : 'Absent Reason Submission'}</h2>
  <p>${introLine}</p>
  <table border="0" cellpadding="6" cellspacing="0" style="font-size:14px;margin-top:12px;">
    <tr><td style="color:#666;">Employee:</td><td><strong>${employeeName}</strong></td></tr>
    <tr><td style="color:#666;">Date:</td><td><strong>${today}</strong></td></tr>
    <tr><td style="color:#666;">Task Count:</td><td><strong>${taskCount}</strong></td></tr>
    <tr><td style="color:#666;">Reason:</td><td><strong style="color:#c0392b;">${reasonLabel}</strong></td></tr>
    <tr><td style="color:#666;">Submission Time:</td><td><strong>${nowTime} IST</strong></td></tr>
    ${screenshotLine}
    ${arrivalLine}
    ${verificationLine}
    ${noteLine}
  </table>
  ${explanation.trim() ? `<p><strong>Explanation:</strong> ${explanation.trim()}</p>` : ''}
  <p style="color:#888;font-size:12px;margin-top:20px;">Sent by SOFTROCK CRM attendance system.</p>
</div>`;
      for (const recipient of [VIRAJ_EMAIL, KAPIL_EMAIL]) {
        try {
          await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              to: recipient,
              subject,
              html,
              notificationType: isCrmDown ? 'absent_crm_down' : 'absent_reason',
              triggeredBy: 'employee',
            }),
          });
        } catch { /* best-effort */ }
      }
    } catch { /* best-effort */ }

    setSubmitting(false);
    onSubmitted();
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[#07111a] px-4 py-8 overflow-y-auto"
      onKeyDown={(e) => { if (e.key === 'Escape') e.preventDefault(); }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-red-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-3">
          <img src="/ICON.jpg" alt="SOFTROCK" className="h-11 w-11 rounded-xl object-cover ring-1 ring-red-500/20" />
          <span className="text-xl font-semibold tracking-tight text-white">SOFTROCK</span>
        </div>

        <div className="mb-6 flex justify-center">
          <div className="relative grid h-20 w-20 place-items-center rounded-2xl border border-red-500/30 bg-red-500/10">
            <Lock className="h-9 w-9 text-red-400" />
            <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">!</span>
          </div>
        </div>

        <h1 className="mb-2 text-center text-2xl font-semibold text-white">
          Attendance Required
        </h1>
        <p className="mb-1 text-center text-sm text-gray-300">
          You were marked <span className="font-semibold text-red-400">ABSENT</span> today ({today}).
        </p>
        <p className="mb-6 text-center text-sm text-amber-300">
          Please submit a reason to unlock the CRM.
        </p>

        {previousCrmDownRejected && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <ShieldAlert className="h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-amber-300">
                Your previous "CRM was down" claim could not be verified.
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                The system checked and the CRM was not down at the time. Please select a different reason and provide the required proof to unlock the CRM.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="rounded-2xl border border-[#1b2a3e] bg-[#0d1a2a] p-6 shadow-2xl">
          <div className="mb-5">
            <label className="mb-3 block text-sm font-semibold text-gray-200">Select a reason</label>
            <div className="space-y-2.5">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => { setSelected(r.value); setCrmDownResult(null); }}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all duration-200 ${
                    selected === r.value
                      ? 'border-red-500/50 bg-red-500/15'
                      : 'border-[#1e2f44] bg-[#0a1622] hover:border-[#2a3f5a] hover:bg-[#101d2e]'
                  }`}
                >
                  <div className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition ${
                    selected === r.value ? 'border-red-400 bg-red-500' : 'border-[#3a4d66]'
                  }`}>
                    {selected === r.value && <div className="h-2 w-2 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${selected === r.value ? 'text-white' : 'text-gray-200'}`}>{r.label}</p>
                    <p className="text-xs text-gray-400">{r.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <label className="mb-2 block text-sm font-semibold text-gray-200">
              Explanation {needsExplanation ? <span className="text-red-400">(required)</span> : <span className="text-gray-500">(optional)</span>}
            </label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={3}
              placeholder={needsExplanation ? 'Please explain why you were absent — this is required.' : 'Add any details about why you were absent...'}
              className={`w-full resize-none rounded-xl border bg-[#0a1622] px-4 py-3 text-sm text-gray-200 outline-none transition-all duration-200 placeholder:text-gray-500 focus:ring-2 ${
                needsExplanation
                  ? 'border-amber-500/40 focus:border-amber-500/60 focus:ring-amber-500/20'
                  : 'border-[#1e2f44] focus:border-red-500/50 focus:ring-red-500/20'
              }`}
            />
            {needsExplanation && (
              <p className="mt-1.5 text-xs text-amber-400">
                You must provide an explanation for this reason. The CRM will remain locked until you submit it.
              </p>
            )}
          </div>

          {/* Screenshot upload for no_task_assigned / forgot_to_add_task */}
          {needsScreenshot && (
            <div className="mb-5">
              <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-200">
                <Camera className="h-4 w-4 text-amber-400" />
                Screenshot / Proof <span className="text-red-400">(required)</span>
              </label>
              <p className="mb-3 text-xs text-gray-400">
                You must upload a screenshot as proof for this reason. The CRM will remain locked until the screenshot is uploaded.
              </p>
              {screenshotPreview ? (
                <div className="relative rounded-xl border border-[#1e2f44] overflow-hidden">
                  <img src={screenshotPreview} alt="Screenshot preview" className="w-full max-h-48 object-contain bg-black/40" />
                  <button
                    type="button"
                    onClick={clearScreenshot}
                    className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-lg bg-black/60 text-white transition hover:bg-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-[#2a3f5a] bg-[#0a1622] px-4 py-6 text-center transition hover:border-red-500/40 hover:bg-[#101d2e]"
                >
                  <Upload className="h-6 w-6 text-gray-400" />
                  <span className="text-sm text-gray-300">Click to upload screenshot</span>
                  <span className="text-xs text-gray-500">PNG, JPG up to 10 MB</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />

              {screenshotPreview && (
                <div className="mt-3">
                  <label className="mb-1.5 block text-xs font-semibold text-gray-300">
                    Arrival / "In" time shown on screenshot <span className="text-gray-500">(optional)</span>
                  </label>
                  <input
                    type="time"
                    value={arrivalTime}
                    onChange={(e) => setArrivalTime(e.target.value)}
                    className="w-full rounded-xl border border-[#1e2f44] bg-[#0a1622] px-4 py-2.5 text-sm text-gray-200 outline-none transition-all duration-200 focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20"
                  />
                  <p className="mt-1.5 text-xs text-gray-500">
                    If the screenshot shows your office "In" time, enter it here. Your attendance will remain ABSENT until a Master verifies it.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* CRM-down verification result */}
          {crmDownResult && (
            <div className={`mb-5 flex items-center gap-3 rounded-xl border p-4 ${
              crmDownResult.verified
                ? 'border-emerald-500/30 bg-emerald-500/10'
                : 'border-amber-500/30 bg-amber-500/10'
            }`}>
              {crmDownResult.verified ? (
                <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
              ) : (
                <ShieldAlert className="h-5 w-5 shrink-0 text-amber-400" />
              )}
              <div>
                <p className={`text-sm font-semibold ${crmDownResult.verified ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {crmDownResult.details}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {crmDownResult.verified
                    ? 'The system confirmed the CRM was down. This will be reviewed by management.'
                    : 'The system could not confirm the CRM was down. Management will review this claim manually.'}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || screenshotUploading || crmDownChecking || !selected || (needsScreenshot && !screenshotFile && !uploadedScreenshotPath) || (needsExplanation && !explanation.trim())}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-red-500 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {submitting || screenshotUploading || crmDownChecking ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {screenshotUploading ? 'Uploading screenshot...' : crmDownChecking ? 'Verifying CRM status...' : submitting ? 'Submitting...' : 'Submit & Unlock CRM'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-gray-500">
          Your submission will be recorded and sent to management. You cannot access the CRM without submitting a reason.
        </p>
      </div>
    </div>
  );
}
