import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ChefHat, CheckSquare, BellRing,
  Receipt, Table2, User, LogOut, Utensils, Monitor,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import type { StaffRole } from '../../types';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  roles: StaffRole[];
  /** key into NotificationCounts to display a badge */
  badgeKey?: 'readyOrderCount' | 'waiterCallCount';
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard',     label: 'Dashboard',      icon: LayoutDashboard, roles: ['ADMIN','CHEF','WAITER','ASSISTANT'] },
  { to: '/kitchen',       label: 'Kitchen Orders', icon: ChefHat,         roles: ['ADMIN','CHEF'] },
  { to: '/kds',           label: 'KDS Display',    icon: Monitor,         roles: ['ADMIN','CHEF','WAITER','ASSISTANT'] },
  { to: '/ready-orders',  label: 'Ready Orders',   icon: CheckSquare,     roles: ['ADMIN','WAITER'],    badgeKey: 'readyOrderCount' },
  { to: '/waiter-calls',  label: 'Waiter Calls',   icon: BellRing,        roles: ['ADMIN','WAITER','ASSISTANT'], badgeKey: 'waiterCallCount' },
  { to: '/bill-requests', label: 'Bill Requests',  icon: Receipt,         roles: ['ADMIN','WAITER'] },
  { to: '/tables',        label: 'Tables',         icon: Table2,          roles: ['ADMIN','WAITER','ASSISTANT'] },
  { to: '/profile',       label: 'Profile',        icon: User,            roles: ['ADMIN','CHEF','WAITER','ASSISTANT'] },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: Props) {
  const { staff, logout } = useAuth();
  const navigate = useNavigate();
  const { readyOrderCount, waiterCallCount } = useNotifications();

  const counts: Record<string, number> = {
    readyOrderCount,
    waiterCallCount,
  };

  const filtered = NAV_ITEMS.filter(item =>
    staff ? item.roles.includes(staff.role) : false
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed top-0 left-0 bottom-0 z-30
        w-64
        bg-white border-r border-gray-200
        dark:bg-gray-900 dark:border-gray-800
        flex flex-col transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-200 dark:border-gray-800">
          <div className="w-9 h-9 rounded-xl bg-primary-500 flex items-center justify-center">
            <Utensils className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-gray-900 dark:text-white text-sm">FlowUp</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Staff Portal</p>
          </div>
        </div>

        {/* Staff badge */}
        {staff && (
          <div className="mx-4 mt-4 px-3 py-2.5 rounded-xl
                          bg-gray-100 dark:bg-gray-800
                          flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center font-bold text-sm shrink-0">
              {staff.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{staff.name}</p>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-primary-500/20 text-primary-400">
                {staff.role}
              </span>
            </div>
          </div>
        )}

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {filtered.map(item => {
            const count = item.badgeKey ? counts[item.badgeKey] : 0;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all
                  ${isActive
                    ? 'bg-primary-500/20 text-primary-400'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
                  }`
                }
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span className="flex-1">{item.label}</span>

                {/* Badge — only shown when count > 0 */}
                {count > 0 && (
                  <span className={`
                    min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold
                    flex items-center justify-center shrink-0
                    ${item.badgeKey === 'waiterCallCount'
                      ? 'bg-red-500 text-white'
                      : 'bg-green-500 text-white'
                    }
                  `}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="px-3 pb-5">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm
                       font-medium text-red-500 dark:text-red-400
                       hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
