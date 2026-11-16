import { useState, FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Loader2, Lock, Mail, User as UserIcon, ArrowLeft } from 'lucide-react';

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = mode === 'signin'
      ? await signIn(email, password)
      : await signUp(email, password, name);
    if (error) setError(error);
    setBusy(false);
  }

  async function sendResetEmail(e: FormEvent) {
    e.preventDefault();
    if (!email) { setError('Enter your email address first'); return; }
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setForgotSent(true);
  }

  return (
    <div className="min-h-screen bg-[#07111a] text-gray-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* ambient gradient */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <img src="/ICON.jpg" alt="SOFTROCK" className="h-11 w-11 rounded-xl object-cover" />
            <span className="text-2xl font-semibold tracking-tight">SOFTROCK</span>
          </div>
          <p className="text-sm text-gray-300">Creative team task management CRM</p>
          <p className="mt-1 text-[10px] font-medium tracking-wide text-gray-400">Task Manager & CRM</p>
        </div>

        <div className="rounded-2xl border border-[#1b4052]/80 bg-cyan-500/[0.04] p-7 shadow-2xl backdrop-blur-xl">
          <div className="flex gap-1 rounded-xl bg-[#091820]/70 p-1 mb-6">
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(null); }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                mode === 'signin' ? 'bg-cyan-500/15 text-white' : 'text-gray-300 hover:text-gray-200'
              }`}
            >Sign in</button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(null); }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                mode === 'signup' ? 'bg-cyan-500/15 text-white' : 'text-gray-300 hover:text-gray-200'
              }`}
            >Create account</button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <Field icon={<UserIcon className="h-4 w-4" />}>
                <input
                  type="text"
                  placeholder="Display name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-gray-300"
                />
              </Field>
            )}
            <Field icon={<Mail className="h-4 w-4" />}>
              <input
                type="email"
                required
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
              />
            </Field>
            <Field icon={<Lock className="h-4 w-4" />}>
              <input
                type="password"
                required
                minLength={6}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
              />
            </Field>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 py-2.5 text-sm font-semibold text-[#07111a] transition hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {forgotOpen && (
            <div className="mt-4 rounded-xl border border-[#1b4052]/80 bg-[#091820]/70 p-4">
              {forgotSent ? (
                <div className="text-center">
                  <p className="text-sm text-cyan-300">Password reset email sent to <span className="font-medium">{email}</span>.</p>
                  <p className="mt-1 text-xs text-gray-300">Check your inbox and click the link to set a new password.</p>
                  <button
                    type="button"
                    onClick={() => { setForgotOpen(false); setForgotSent(false); }}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-300 hover:text-white"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={sendResetEmail} className="space-y-3">
                  <p className="text-sm text-gray-300">Enter your email and we'll send you a password reset link.</p>
                  <Field icon={<Mail className="h-4 w-4" />}>
                    <input
                      type="email"
                      required
                      placeholder="Email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-transparent text-sm outline-none placeholder:text-gray-300"
                    />
                  </Field>
                  {error && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200">{error}</div>
                  )}
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => { setForgotOpen(false); setError(null); }}
                      className="inline-flex items-center gap-1.5 text-xs text-gray-300 hover:text-white"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" /> Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className="rounded-lg bg-cyan-500/15 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-cyan-500/20 disabled:opacity-50 flex items-center gap-2"
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                      Send reset link
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {!forgotOpen && mode === 'signin' && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => { setForgotOpen(true); setForgotSent(false); setError(null); }}
                className="text-xs text-gray-300 transition hover:text-cyan-300"
              >
                Forgot password?
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#1b4052]/80 bg-[#091820]/70 px-3.5 py-3 focus-within:border-cyan-400/60 transition">
      <span className="text-gray-300">{icon}</span>
      {children}
    </div>
  );
}
