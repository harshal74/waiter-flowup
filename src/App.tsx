import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';

import LoginPage        from './pages/LoginPage';
import SignupPage       from './pages/SignupPage';
import DashboardPage    from './pages/DashboardPage';
import KitchenPage      from './pages/KitchenPage';
import ReadyOrdersPage  from './pages/ReadyOrdersPage';
import WaiterCallsPage  from './pages/WaiterCallsPage';
import BillRequestsPage from './pages/BillRequestsPage';
import TablesPage       from './pages/TablesPage';
import ProfilePage      from './pages/ProfilePage';
import KDSPage          from './pages/KDSPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login"  element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />

            {/* Auth guard — redirects to /login if not authenticated */}
            <Route element={<ProtectedRoute />}>
              {/* App shell with sidebar */}
              <Route element={<AppLayout />}>
                <Route path="/dashboard"     element={<DashboardPage />} />
                <Route path="/kitchen"       element={<KitchenPage />} />
                <Route path="/ready-orders"  element={<ReadyOrdersPage />} />
                <Route path="/waiter-calls"  element={<WaiterCallsPage />} />
                <Route path="/bill-requests" element={<BillRequestsPage />} />
                <Route path="/tables"        element={<TablesPage />} />
                <Route path="/kds"           element={<KDSPage />} />
                <Route path="/profile"       element={<ProfilePage />} />
                <Route path="/"              element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Route>

            {/* Any unknown path → dashboard (which will redirect to login if not authed) */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>

          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: '#1f2937',
                color: '#f9fafb',
                borderRadius: '12px',
                border: '1px solid #374151',
              },
              success: { iconTheme: { primary: '#10B981', secondary: '#fff' } },
              error:   { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
            }}
          />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
