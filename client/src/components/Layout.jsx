import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  LayoutDashboard, ClipboardCheck, CalendarDays, FileSpreadsheet, Users,
  AlertTriangle, FileEdit, Bell, LogOut, Menu, X, GraduationCap, Settings,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { signedOut } from '../app/authSlice';
import { useLogoutMutation, useGetNotificationsQuery, useMarkNotificationsReadMutation } from '../api/endpoints';
import { initials, fmtAgo } from '../utils/format';

function navFor({ isStudent, isStaff, isAdvisor, isManager, isAdmin }) {
  if (isStudent) {
    return [
      { to: '/', label: 'My attendance', icon: LayoutDashboard, end: true },
      { to: '/my-history', label: 'Daily history', icon: CalendarDays },
      { to: '/leaves', label: 'Leave & on-duty', icon: FileEdit },
    ];
  }
  const items = [
    { to: '/', label: 'Today', icon: ClipboardCheck, end: true },
    { to: '/sessions', label: 'Classes', icon: CalendarDays },
  ];
  if (isAdvisor || isManager) items.push({ to: '/defaulters', label: 'Low attendance', icon: AlertTriangle });
  if (isStaff) items.push({ to: '/corrections', label: 'Corrections', icon: FileEdit });
  if (isAdvisor || isManager) items.push({ to: '/leaves', label: 'Leave requests', icon: FileEdit });
  if (isManager) items.push({ to: '/reports', label: 'Reports', icon: Users });
  items.push({ to: '/exports', label: 'Excel exports', icon: FileSpreadsheet });
  if (isAdmin) items.push({ to: '/admin', label: 'Administration', icon: Settings });
  return items;
}

export default function Layout() {
  const auth = useAuth();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [logout] = useLogoutMutation();
  const [open, setOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

  const { data: notifications = [] } = useGetNotificationsQuery({}, { pollingInterval: 60000 });
  const [markRead] = useMarkNotificationsReadMutation();
  const unread = notifications.filter((n) => !n.isRead).length;

  const items = navFor(auth);

  const handleLogout = async () => {
    try { await logout().unwrap(); } catch { /* ignore */ }
    dispatch(signedOut());
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-white">
      <a href="#main" className="skip-link">Skip to main content</a>

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 transform transition-transform
          lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Main navigation"
      >
        <div className="h-16 flex items-center gap-2 px-5 border-b border-slate-200">
          <GraduationCap className="text-brand-600" size={22} aria-hidden="true" />
          <span className="font-semibold text-slate-900">Smart Attendance</span>
        </div>
        <nav className="p-3 space-y-1">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-900/20 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sticky top-0 z-20">
          <button
            type="button"
            className="btn-ghost lg:hidden"
            aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                className="btn-ghost relative"
                aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
                aria-expanded={bellOpen}
                onClick={() => { setBellOpen(!bellOpen); if (unread) markRead({ ids: [] }); }}
              >
                <Bell size={20} aria-hidden="true" />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
              {bellOpen && (
                <div className="absolute right-0 mt-2 w-80 card p-2 max-h-96 overflow-auto" role="region" aria-label="Notifications">
                  {notifications.length === 0 && <p className="p-4 text-sm text-slate-500">Nothing new.</p>}
                  {notifications.slice(0, 15).map((n) => (
                    <div key={n._id} className="p-3 rounded-lg hover:bg-slate-50 border-b border-slate-100 last:border-0">
                      <p className="text-sm font-medium text-slate-800">{n.title}</p>
                      {n.body && <p className="text-xs text-slate-600 mt-0.5">{n.body}</p>}
                      <p className="text-[11px] text-slate-400 mt-1">{fmtAgo(n.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="h-8 w-8 rounded-full bg-brand-600 text-white text-xs font-semibold flex items-center justify-center" aria-hidden="true">
                {initials(auth.user?.name)}
              </div>
              <div className="hidden sm:block leading-tight">
                <p className="text-sm font-medium text-slate-800">{auth.user?.name}</p>
                <p className="text-[11px] text-slate-500">{auth.user?.role?.replace(/_/g, ' ')}</p>
              </div>
              <button type="button" className="btn-ghost" onClick={handleLogout} aria-label="Sign out">
                <LogOut size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        <main id="main" className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
