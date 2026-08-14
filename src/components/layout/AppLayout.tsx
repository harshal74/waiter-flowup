import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, Wifi, WifiOff, Sun, Moon } from 'lucide-react';
import Sidebar from './Sidebar';
import { useSocket } from '../../context/SocketContext';
import { useTheme } from '../../context/ThemeContext';

export default function AppLayout() {
  // Match admin: open by default on desktop (lg = 1024px+)
  const [sidebarOpen, setSidebarOpen] = useState(
    typeof window !== 'undefined' && window.innerWidth >= 1024
  );
  const { isConnected } = useSocket();
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-950 overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between px-4 py-3
                           bg-white border-b border-gray-200
                           dark:bg-gray-900 dark:border-gray-800 shrink-0">
          <button
            className="lg:hidden p-2 rounded-xl
                       hover:bg-gray-100 dark:hover:bg-gray-800
                       text-gray-500 dark:text-gray-400"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="ml-auto flex items-center gap-3">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl
                         hover:bg-gray-100 dark:hover:bg-gray-800
                         text-gray-500 dark:text-gray-400
                         hover:text-gray-700 dark:hover:text-gray-200
                         transition-colors"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark
                ? <Sun  className="w-4 h-4" />
                : <Moon className="w-4 h-4" />
              }
            </button>

            {/* Socket status */}
            <span className={`flex items-center gap-1.5 text-xs font-medium ${
              isConnected ? 'text-green-500' : 'text-amber-500'
            }`}>
              {isConnected
                ? <><Wifi className="w-3.5 h-3.5" /> Live</>
                : <><WifiOff className="w-3.5 h-3.5" /> Offline</>
              }
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
