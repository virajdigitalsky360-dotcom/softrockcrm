import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Video, Briefcase, Share2, Palette,
  Users, FileBarChart, ShieldCheck, SlidersHorizontal,
  LogOut, Menu, X, Search, CalendarClock, Bell, BellOff, FileSpreadsheet, Activity,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useInactivityNotifications } from '@/lib/useInactivityNotifications';
import { useTaskManagerAccess } from '@/lib/useAccessControl';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  masterOnly?: boolean;
  virajOnly?: boolean;
  attendanceMasterOnly?: boolean;
  leaveAccess?: boolean;
  taskManagerAccess?: boolean;
  masterOrTaskManager?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
  { to: '/workspace/video-editor', label: 'Video Editor', icon: <Video className="h-[18px] w-[18px]" /> },
  { to: '/workspace/freelance', label: 'Freelance', icon: <Briefcase className="h-[18px] w-[18px]" /> },
  { to: '/workspace/social-media', label: 'Social Media', icon: <Share2 className="h-[18px] w-[18px]" /> },
  { to: '/workspace/graphics', label: 'Graphics', icon: <Palette className="h-[18px] w-[18px]" /> },
  { to: '/clients', label: 'Clients', icon: <Users className="h-[18px] w-[18px]" /> },
  { to: '/leaves', label: 'Leave', icon: <CalendarClock className="h-[18px] w-[18px]" /> },
  { to: '/attendance', label: 'Attendance', icon: <CalendarClock className="h-[18px] w-[18px]" /> },
  { to: '/attendance-reports', label: 'Attendance Reports', icon: <FileSpreadsheet className="h-[18px] w-[18px]" />, attendanceMasterOnly: true },
  { to: '/reports', label: 'Reports', icon: <FileBarChart className="h-[18px] w-[18px]" /> },
  { to: '/task-manager', label: 'Task Manager', icon: <FileBarChart className="h-[18px] w-[18px]" />, taskManagerAccess: true },
  { to: '/master', label: 'Master Panel', icon: <ShieldCheck className="h-[18px] w-[18px]" />, masterOrTaskManager: true },
  { to: '/control', label: 'Control Panel', icon: <SlidersHorizontal className="h-[18px] w-[18px]" />, masterOnly: true },
  { to: '/control-center', label: 'Control Center', icon: <Activity className="h-[18px] w-[18px]" />, virajOnly: true },
];

export default function AppShell({ children, onSearch }: { children: React.ReactNode; onSearch?: (q: string) => void }) {
  const { isMaster, canViewLeaves, profile, signOut, user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const attendanceMasterEmails = ['viraj.digitalsky360@gmail.com', 'kapilprajapati9054@gmail.com'];
  const canManageAttendance = isMaster && attendanceMasterEmails.includes(user?.email?.toLowerCase() ?? '');
  const isViraj = (user?.email ?? '').toLowerCase() === 'viraj.digitalsky360@gmail.com';
  const { hasAccess: canAccessTaskManager } = useTaskManagerAccess();
  const items = NAV.filter((n) => (!n.masterOnly || isMaster) && (!n.virajOnly || isViraj) && (!n.attendanceMasterOnly || canManageAttendance) && (!n.leaveAccess || canViewLeaves) && (!n.taskManagerAccess || canAccessTaskManager) && (!n.masterOrTaskManager || isMaster || canAccessTaskManager));

  const { perm: notifPerm, requestPermission } = useInactivityNotifications();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const SidebarInner = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-[#e8eef5] px-6 py-5">
        <img src="/ICON.jpg" alt="SOFTROCK" className="h-9 w-9 rounded-xl object-cover shadow-sm" />
        <div>
          <span className="block text-lg font-bold tracking-tight text-[#17243d]">SOFTROCK</span>
          <span className="block text-[10px] font-medium text-[#5a6c84]">Task Manager & CRM</span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 hover:translate-x-0.5 ${
                isActive
                  ? 'bg-[#1478d4] text-white shadow-sm shadow-blue-200'
                  : 'text-[#3d5070] hover:bg-[#eef5fc] hover:text-[#17243d]' 
              }`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-[#e8eef5] p-4">
        {notifPerm === 'default' && (
          <button
            onClick={requestPermission}
            className="mb-2 flex w-full items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-700 transition-all duration-200 hover:bg-cyan-500/20"
          >
            <Bell className="h-3.5 w-3.5 shrink-0" />
            <span>Enable desktop notifications for task inactivity alerts</span>
          </button>
        )}
        {notifPerm === 'denied' && (
          <div className="mb-2 space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-700">
            <div className="flex items-center gap-1.5">
              <BellOff className="h-3.5 w-3.5 shrink-0" />
              <span>Notifications are blocked. Click the lock icon in your browser address bar, set Notifications to Allow, then reload this page.</span>
            </div>
            <button
              onClick={requestPermission}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] font-semibold text-amber-800 transition-all duration-200 hover:bg-amber-500/20"
            >
              <Bell className="h-3 w-3" /> Try enabling again
            </button>
          </div>
        )}
        <div className="mb-2 flex items-center gap-3 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-[#e8f1fb] text-xs font-semibold text-[#1478d4]">
            {(profile?.display_name || profile?.email || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-[#17243d]">
              {profile?.display_name || profile?.email}
            </p>
            <p className="text-[11px] capitalize text-[#5a6c84]">{(profile?.role ?? '').replace('_', ' ')}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#5a6c84] transition-all duration-200 hover:bg-[#eef5fc] hover:text-[#17243d]"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f5f8fc] text-[#17243d]">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-[#e3eaf3] bg-white lg:block">
        {SidebarInner}
      </aside>

      {/* mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-[#e3eaf3] bg-white">
            {SidebarInner}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        {/* topbar */}
        <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-[#e5ebf3] bg-white/95 px-4 backdrop-blur-xl lg:px-8">
          <button
            onClick={() => setMobileOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-lg text-[#3d5070] transition-all duration-200 hover:bg-[#eef5fc] hover:scale-105 active:scale-95 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          {onSearch && (
            <div className="relative w-full max-w-[410px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#3d5070]" />
              <input
                type="text"
                placeholder="Search tasks, clients, people..."
                onChange={(e) => onSearch(e.target.value)}
                className="w-full rounded-xl border border-[#e1e8f1] bg-[#fbfcfe] py-2.5 pl-10 pr-3 text-sm text-[#17243d] outline-none transition-all duration-200 placeholder:text-[#5a6c84] focus:border-[#1478d4] focus:ring-2 focus:ring-blue-100"
              />
            </div>
          )}
          <div className="ml-auto flex items-center gap-4">
            <button className="relative grid h-9 w-9 place-items-center rounded-lg text-[#3d5070] transition hover:bg-[#eef5fc]" aria-label="Notifications">
              <Bell className="h-[18px] w-[18px]" />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" />
            </button>
            <div className="hidden items-center gap-2 sm:flex">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-[#3d5b86] text-sm font-semibold text-white">{(profile?.display_name || profile?.email || '?').charAt(0).toUpperCase()}</div>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-[#17243d]">{profile?.display_name || profile?.email}</p>
                <p className="text-xs capitalize text-[#5a6c84]">{(profile?.role ?? '').replace('_', ' ')}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-68px)] p-4 lg:p-8">{children}</main>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5ebf3] px-4 py-5 text-xs text-[#5a6c84] lg:px-8">
          <span>© 2026 Softrock. All rights reserved.</span>
          <span className="font-medium tracking-wide text-[#3d5070]">SOFTROCK CRM</span>
        </footer>
      </div>

      {/* close button for mobile when open */}
      {mobileOpen && (
        <button
          onClick={() => setMobileOpen(false)}
          className="fixed right-4 top-4 z-50 grid h-9 w-9 place-items-center rounded-lg bg-[#1478d4] text-white lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
