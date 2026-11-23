import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { StaffRole } from '../../types';

/** Redirects staff whose role is not allowed. The backend enforces the same rule. */
export default function RoleRoute({ roles, children }: { roles: StaffRole[]; children: React.ReactNode }) {
  const { staff } = useAuth();
  if (staff && !roles.includes(staff.role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
