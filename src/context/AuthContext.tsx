import React, { createContext, useContext, useState, useCallback } from 'react';
import API from '../lib/api';
import type { Staff } from '../types';

interface AuthContextType {
  staff: Staff | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateStaff: (data: Partial<Staff>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const TOKEN_KEY = 'flowup_staff_token';
export const USER_KEY  = 'flowup_staff_user';

function readStaff(): Staff | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isTokenValid(): boolean {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(() =>
    isTokenValid() ? readStaff() : null
  );

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await API.post('/staff/login', { email, password });
      const { token: jwt, staff: staffData } = res.data;

      // Write to localStorage FIRST — ProtectedRoute reads from here
      localStorage.setItem(TOKEN_KEY, jwt);
      localStorage.setItem(USER_KEY, JSON.stringify(staffData));

      // Then update React state
      setStaff(staffData);

      return { success: true };
    } catch (err: any) {
      const data = err?.response?.data;
      return {
        success:     false,
        error:       data?.message || 'Login failed',
      };
    }
  }, []);

  const logout = useCallback(async () => {
    try { await API.post('/staff/logout'); } catch { /* ignore */ }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setStaff(null);
  }, []);

  const updateStaff = useCallback((data: Partial<Staff>) => {
    setStaff(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...data };
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{
      staff,
      isAuthenticated: isTokenValid() && !!staff,
      login,
      logout,
      updateStaff,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
