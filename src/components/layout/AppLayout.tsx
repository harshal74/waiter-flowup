import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, Wifi, WifiOff } from 'lucide-react';
import Sidebar from './Sidebar';
import { useSocket } from '../../context/SocketContext';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isConnected } = useSocket();

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
          <button
            className="lg:hidden p-2 rounded-xl hover:bg-gray-800 text-gray-400"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="ml-auto flex items-center gap-2">
            <span className={`flex items-center gap-1.5 text-xs font-medium ${isConnected ? 'text-green-400' : 'text-amber-400'}`}>
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
