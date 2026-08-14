import { Navigate, Outlet } from 'react-router-dom';
import { TOKEN_KEY } from '../../context/AuthContext';

/**
 * Reads directly from localStorage — no React state lag.
 * Token is written to localStorage BEFORE navigate() fires,
 * so this check always sees the fresh value.
 */
export default function ProtectedRoute() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return <Navigate to="/login" replace />;

    const parts = token.split('.');
    if (parts.length !== 3) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('flowup_staff_user');
      return <Navigate to="/login" replace />;
    }

    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp * 1000 <= Date.now()) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('flowup_staff_user');
      return <Navigate to="/login" replace />;
    }

    return <Outlet />;
  } catch {
    return <Navigate to="/login" replace />;
  }
}
