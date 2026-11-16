import { useEffect, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Loader2, Lock, ArrowLeft, Mail } from 'lucide-react';

type PageState =
  | { kind: 'checking' }
  | { kind: 'form' }
  | { kind: 'expired' }
  | { kind: 'error'; message: string };

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [page, setPage] = useState<PageState>({ kind: 'checking' });
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    // Supabase puts the recovery session in the URL hash (#access_token=...)
    // or an error in the query/hash (?error=...&error_code=otp_expired).
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const queryParams = new URLSearchParams(window.location.search);

    const hasHashError =
      hashParams.has('error') || hashParams.has('error_description') || hashParams.has('error_code');
    const hasQueryError =
      queryParams.has('error') || queryParams.has('error_description') || queryParams.has('error_code');
    const expired =
      queryParams.get('error_code') === 'otp_expired' ||
      hashParams.get('error_code') === 'otp_expired' ||
      (queryParams.get('error_description') ?? hashParams.get('error_description') ?? '').includes('expired');

    if (hasHashError || hasQueryError) {
      setPage(expired ? { kind: 'expired' } : { kind: 'error', message: queryParams.get('error_description') ?? hashParams.get('error_description') ?? 'This reset link is not valid.' });
      return;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setPage({ kind: 'form' });
    });

    // Some clients deliver the recovery session without the event (e.g. hash
    // session already processed); fall back to a session check shortly after.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPage((prev) => (prev.kind === 'checking' ? { kind: 'form' } : prev));
      else setPage((prev) => (prev.kind === 'checking' ? { kind: 'expired' } : prev));
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    setTimeout(() => navigate('/login'), 2500);
  }

  async function sendResetEmail(e: FormEvent) {
    e.preventDefault();
    if (!resetEmail) { return; }
    setResetBusy(true);
    await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetBusy(false);
    setResetSent(true);
  }

  if (page.kind === 'checking') {
    return (
      <div className="grid min-h-screen place-items-center bg-[#07111a]">
        <Loader2 className="h-7 w-7 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07111a] text-gray-100 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <img src="/ICON.jpg" alt="SOFTROCK" className="h-11 w-11 rounded-xl object-cover" />
            <span className="text-2xl font-semibold tracking-tight">SOFTROCK</span>
          </div>
          <p className="text-sm text-gray-300">Set a new password for your account</p>
          <p className="mt-1 text-[10px] font-medium tracking-wide text-gray-400">Task Manager & CRM</p>
        </div>

        <div className="rounded-2xl border border-[#1b4052]/80 bg-cyan-500/[0.04] p-7 shadow-2xl backdrop-blur-xl">
          {page.kind === 'expired' ? (
            <div className="text-center">
              <p className="text-base font-medium text-white">This link has expired, request a new one</p>
              <p className="mt-2 text-xs text-gray-300">Password reset links are only valid for a short time.</p>
              {resetSent ? (
                <p className="mt-5 text-sm text-cyan-300">Reset email sent to <span className="font-medium">{resetEmail}</span>. Check your inbox.</p>
              ) : (
                <form onSubmit={sendResetEmail} className="mt-5 space-y-3 text-left">
                  <div className="flex items-center gap-3 rounded-xl border border-[#1b4052]/80 bg-[#091820]/70 px-3.5 py-3 focus-within:border-cyan-400/60 transition">
                    <Mail className="h-4 w-4 text-gray-300" />
                    <input
                      type="email"
                      required
                      placeholder="Your email address"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full bg-transparent text-sm outline-none placeholder:text-gray-300"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={resetBusy}
                    className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 py-2.5 text-sm font-semibold text-[#07111a] transition hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {resetBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Request new reset email
                  </button>
                </form>
              )}
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="mt-4 inline-flex items-center gap-1.5 text-xs text-gray-300 transition hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
              </button>
            </div>
          ) : page.kind === 'error' ? (
            <div className="text-center">
              <p className="text-sm font-medium text-red-300">{page.message}</p>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="mt-4 inline-flex items-center gap-1.5 text-xs text-gray-300 transition hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
              </button>
            </div>
          ) : done ? (
            <div className="text-center py-6">
              <p className="text-sm font-medium text-cyan-300">Password updated successfully.</p>
              <p className="mt-1 text-xs text-gray-300">Redirecting you to sign in...</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-[#1b4052]/80 bg-[#091820]/70 px-3.5 py-3 focus-within:border-cyan-400/60 transition">
                <Lock className="h-4 w-4 text-gray-300" />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-gray-300"
                />
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-[#1b4052]/80 bg-[#091820]/70 px-3.5 py-3 focus-within:border-cyan-400/60 transition">
                <Lock className="h-4 w-4 text-gray-300" />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Confirm new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-gray-300"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200">{error}</div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 py-2.5 text-sm font-semibold text-[#07111a] transition hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Update password
              </button>
            </form>
          )}

          {page.kind === 'form' && !done && (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="inline-flex items-center gap-1.5 text-xs text-gray-300 transition hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
