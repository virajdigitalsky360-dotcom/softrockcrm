import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth';
import AppShell from '@/components/AppShell';
import AuthPage from '@/pages/AuthPage';
import Dashboard from '@/pages/Dashboard';
import WorkspacePage from '@/pages/WorkspacePage';
import ClientsPage from '@/pages/ClientsPage';
import ReportsPage from '@/pages/ReportsPage';
import MasterPanel from '@/pages/MasterPanel';
import ControlPanel from '@/pages/ControlPanel';
import MasterControlCenter from '@/pages/MasterControlCenter';
import LeavePage from '@/pages/LeavePage';
import AttendancePage from '@/pages/AttendancePage';
import AttendanceReportsPage from '@/pages/AttendanceReportsPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import TaskManagerPage from '@/pages/TaskManagerPage';
import { PageLoader } from '@/components/ui';
import { useEffect, useState } from 'react';
import { useTaskManagerAccess } from '@/lib/useAccessControl';
import CrmAssistantWidget from '@/components/CrmAssistantWidget';
import HolidayChatbotWidget from '@/components/HolidayChatbotWidget';
import { useGlobalErrorCapture } from '@/lib/useCrmAssistant';
import { useAbsentLock } from '@/lib/useAbsentLock';
import AbsentLockScreen from '@/components/AbsentLockScreen';

function Protected({ children }: { children: React.ReactNode }) {
  const { session, loading, user } = useAuth();
  const { state: absentLockState, recheck } = useAbsentLock();

  if (loading || absentLockState === 'checking') return <PageLoader />;
  if (!session) return <AuthPage />;
  if (absentLockState === 'locked') return <AbsentLockScreen onSubmitted={recheck} />;
  return <>{children}</>;
}

function MasterOnly({ children }: { children: React.ReactNode }) {
  const { isMaster, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!isMaster) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const ATTENDANCE_MASTER_EMAILS = ['viraj.digitalsky360@gmail.com', 'kapilprajapati9054@gmail.com'];

function AttendanceMasterOnly({ children }: { children: React.ReactNode }) {
  const { isMaster, user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!isMaster || !ATTENDANCE_MASTER_EMAILS.includes(user?.email?.toLowerCase() ?? '')) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function VirajOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if ((user?.email ?? '').toLowerCase() !== 'viraj.digitalsky360@gmail.com') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function LeaveAccess({ children }: { children: React.ReactNode }) {
  const { canViewLeaves, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!canViewLeaves) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function TaskManagerAccess({ children }: { children: React.ReactNode }) {
  const { hasAccess, loading } = useTaskManagerAccess();
  if (loading) return <PageLoader />;
  if (!hasAccess) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();
  const isViraj = (user?.email ?? '').toLowerCase() === 'viraj.digitalsky360@gmail.com';

  useGlobalErrorCapture();

  useEffect(() => {
    if (!search) return;
    navigate(`/search?q=${encodeURIComponent(search)}`);
  }, [search]);

  return (
    <AppShell onSearch={setSearch}>
      {children}
      {isViraj && <CrmAssistantWidget />}
      {isViraj && <HolidayChatbotWidget />}
    </AppShell>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Protected><Shell><Dashboard /></Shell></Protected>} />
      <Route path="/workspace/:slug" element={<Protected><Shell><WorkspacePage /></Shell></Protected>} />
      <Route path="/clients" element={<Protected><Shell><ClientsPage /></Shell></Protected>} />
      <Route path="/leaves" element={<Protected><LeaveAccess><Shell><LeavePage /></Shell></LeaveAccess></Protected>} />
      <Route path="/attendance" element={<Protected><Shell><AttendancePage /></Shell></Protected>} />
      <Route path="/attendance-reports" element={<Protected><AttendanceMasterOnly><Shell><AttendanceReportsPage /></Shell></AttendanceMasterOnly></Protected>} />
      <Route path="/reports" element={<Protected><Shell><ReportsPage /></Shell></Protected>} />
      <Route path="/master" element={<Protected><TaskManagerAccess><Shell><MasterPanel /></Shell></TaskManagerAccess></Protected>} />
      <Route path="/control" element={<Protected><MasterOnly><Shell><ControlPanel /></Shell></MasterOnly></Protected>} />
      <Route path="/control-center" element={<Protected><VirajOnly><Shell><MasterControlCenter /></Shell></VirajOnly></Protected>} />
      <Route path="/task-manager" element={<Protected><TaskManagerAccess><Shell><TaskManagerPage /></Shell></TaskManagerAccess></Protected>} />
      <Route path="/search" element={<Protected><Shell><SearchResults /></Shell></Protected>} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import { useTasks, useClients, useTeamMembers } from '@/lib/hooks';
import { useSearchParams as useSearchParamsRR } from 'react-router-dom';
import { Card, EmptyState, StatusBadge } from '@/components/ui';
import { Search } from 'lucide-react';

function SearchResults() {
  const [params] = useSearchParamsRR();
  const q = params.get('q') ?? '';
  const { tasks, loading } = useTasks();
  const { clients } = useClients();
  const { members } = useTeamMembers();

  const ql = q.toLowerCase();
  const matchedTasks = tasks.filter((t) =>
    t.name.toLowerCase().includes(ql) ||
    t.client?.name?.toLowerCase().includes(ql) ||
    t.team_member?.name?.toLowerCase().includes(ql)
  );
  const matchedClients = clients.filter((c) => c.name.toLowerCase().includes(ql));
  const matchedMembers = members.filter((m) => m.name.toLowerCase().includes(ql));

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-[#17243d]">
          <Search className="h-5 w-5 text-cyan-400" /> Search: "{q}"
        </h1>
        <p className="text-sm text-[#7088a8]">{matchedTasks.length + matchedClients.length + matchedMembers.length} results</p>
      </div>

      {matchedTasks.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[#e5ebf3] px-5 py-3 text-sm font-semibold text-[#17243d]">Tasks ({matchedTasks.length})</div>
          <div className="divide-y divide-[#edf1f6]">
            {matchedTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-[#17243d]">{t.name}</p>
                  <p className="text-xs text-[#7088a8]">{t.team_member?.name} · {t.client?.name} · {t.workspace?.name}</p>
                </div>
                <StatusBadge status={t.status} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {matchedClients.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[#e5ebf3] px-5 py-3 text-sm font-semibold text-[#17243d]">Clients ({matchedClients.length})</div>
          <div className="divide-y divide-[#edf1f6]">
            {matchedClients.map((c) => (
              <div key={c.id} className="px-5 py-3">
                <p className="text-sm font-medium text-[#17243d]">{c.name}</p>
                <p className="text-xs text-[#7088a8]">{c.email ?? 'No email'}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {matchedMembers.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[#e5ebf3] px-5 py-3 text-sm font-semibold text-[#17243d]">People ({matchedMembers.length})</div>
          <div className="divide-y divide-[#edf1f6]">
            {matchedMembers.map((m) => (
              <div key={m.id} className="px-5 py-3">
                <p className="text-sm font-medium text-[#17243d]">{m.name}</p>
                <p className="text-xs text-[#7088a8]">{m.workspace?.name ?? 'No workspace'}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {matchedTasks.length === 0 && matchedClients.length === 0 && matchedMembers.length === 0 && (
        <Card><EmptyState title="No results found" hint="Try searching for a task name, client, or person." /></Card>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
