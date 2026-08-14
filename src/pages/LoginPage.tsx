import { useState, FormEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Utensils, Loader2, Eye, EyeOff } from 'lucide-react';
import { TOKEN_KEY, USER_KEY } from '../context/AuthContext';
import toast from 'react-hot-toast';
import axios from 'axios';

// Use relative /api in dev (Vite proxy), or absolute URL in production
const BASE = import.meta.env.VITE_API_URL || '/api';

export default function LoginPage() {
  const navigate = useNavigate();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // Already logged in — redirect without navigate() during render
  const existingToken = localStorage.getItem(TOKEN_KEY);
  if (existingToken) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }

    setLoading(true);

    try {
      const res = await axios.post(
        `${BASE}/staff/login`,
        { email: email.trim(), password },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const { token, staff } = res.data;

      if (!token || !staff) {
        setError('Invalid server response — missing token or staff data');
        setLoading(false);
        return;
      }

      // Write to localStorage BEFORE navigation so ProtectedRoute sees the token
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(staff));

      toast.success(`Welcome, ${staff.name}!`);

      // Navigate — ProtectedRoute reads localStorage directly, no React state lag
      navigate('/dashboard', { replace: true });

    } catch (err: any) {
      const status      = err?.response?.status;
      const message     = err?.response?.data?.message || err.message || 'Login failed';
      const requiresOtp = err?.response?.data?.requiresOtp;

      setError(`${status ? `[${status}] ` : ''}${message}`);
      setLoading(false);

      if (requiresOtp) {
        toast('Please verify your email first.', { icon: '📧' });
        navigate(`/signup?email=${encodeURIComponent(email.trim())}&step=otp`, { replace: true });
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-16 h-16 rounded-2xl bg-primary-500 flex items-center justify-center shadow-lg shadow-primary-500/30">
            <Utensils className="w-8 h-8 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">FlowUp Staff</h1>
            <p className="text-gray-400 text-sm mt-1">Sign in to your staff account</p>
          </div>
        </div>

        <div className="card p-6 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" placeholder="staff@restaurant.com"
                value={email} onChange={e => setEmail(e.target.value)}
                autoComplete="email" disabled={loading} />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  className="input pr-12" placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password" disabled={loading} />
                <button type="button" tabIndex={-1}
                  onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 break-all">
                ❌ {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
                : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-500">
            Don't have an account?{' '}
            <a href="/signup" className="text-primary-400 hover:text-primary-300 font-medium">Register</a>
          </p>
        </div>
      </div>
    </div>
  );
}
