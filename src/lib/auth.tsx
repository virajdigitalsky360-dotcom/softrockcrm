import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile, Role } from './types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role;
  isMaster: boolean;
  isTaskManager: boolean;
  isViewOnly: boolean;
  canDeleteTasks: boolean;
  canDeleteTask: boolean;
  loading: boolean;
  canViewLeaves: boolean;
  canManageLeaves: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);



export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, team_member:team_members(*, workspace:workspaces(*))')
      .eq('id', uid)
      .maybeSingle();
    if (error) {
      // eslint-disable-next-line no-console
      console.error('profile load error', error);
      return;
    }
    if (data) setProfile(data as unknown as Profile);
  }, []);

  useEffect(() => {
    let mounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const startTimeout = () => {
      timeoutId = setTimeout(() => {
        if (mounted) {
          // eslint-disable-next-line no-console
          console.warn('Auth session check timed out after 8s — showing login.');
          setLoading(false);
        }
      }, 8000);
    };

    startTimeout();

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      const uid = data.session?.user?.id;
      if (uid) {
        loadProfile(uid)
          .catch(() => {})
          .finally(() => {
            if (timeoutId) clearTimeout(timeoutId);
            if (mounted) setLoading(false);
          });
      } else {
        if (timeoutId) clearTimeout(timeoutId);
        setLoading(false);
      }
    }).catch(() => {
      if (timeoutId) clearTimeout(timeoutId);
      if (mounted) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      (async () => {
        try {
          setSession(sess);
          const uid = sess?.user?.id;
          if (uid) {
            await loadProfile(uid);
          } else {
            setProfile(null);
          }
        } catch {
          // ignore profile load errors
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
          if (mounted) setLoading(false);
        }
      })();
    });

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) return { error: error.message };
    if (data.user) {
      // update display name on profile (trigger already created the row)
      await supabase
        .from('profiles')
        .update({ display_name: displayName ?? null })
        .eq('id', data.user.id);
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const uid = session?.user?.id;
    if (uid) await loadProfile(uid);
  }, [session, loadProfile]);

  const role: Role = profile?.role ?? 'normal';
  const isViraj = profile?.email === 'viraj.digitalsky360@gmail.com';
  const isMaster = role === 'master' || isViraj;
  const isTaskManager = role === 'task_manager';
  const isViewOnly = role === 'view_all';
  const canViewLeaves = true;
  const canManageLeaves = isMaster;
  const canDeleteTasks = isMaster || isTaskManager;
  const isRostan = profile?.email === 'softrockind@gmail.com';
  const canDeleteTask = isViraj || isRostan;

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        role,
        isMaster,
        isTaskManager,
        isViewOnly,
        canDeleteTasks,
        canDeleteTask,
        loading,
        canViewLeaves,
        canManageLeaves,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
