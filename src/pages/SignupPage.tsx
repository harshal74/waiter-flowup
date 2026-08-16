import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Utensils, Loader2, CheckCircle2, Clock } from 'lucide-react';
import API, { RESTAURANT_ID } from '../lib/api';
import toast from 'react-hot-toast';
import type { StaffRole } from '../types';

const ROLES: StaffRole[] = ['CHEF', 'WAITER', 'ASSISTANT'];

type Step = 'form' | 'success';

export default function SignupPage() {
  const [step, setStep] = useState<Step>('form');
  const [form, setForm] = useState({
    name: '', email: '', mobile: '', password: '', confirmPassword: '',
    role: 'WAITER' as StaffRole,
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  // ── Submit registration request ─────────────────────────────────
  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // Client-side validation
    const fields = ['name', 'email', 'mobile', 'password', 'role'] as const;
    for (const f of fields) {
      if (!form[f as keyof typeof form]?.toString().trim()) {
        setError(`${f.charAt(0).toUpperCase() + f.slice(1)} is required`); return;
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Invalid email format'); return;
    }
    if (!/^\+?\d{7,15}$/.test(form.mobile.replace(/\s/g, ''))) {
      setError('Mobile must be 7–15 digits (optional leading +)'); return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters'); return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match'); return;
    }

    setLoading(true);
    try {
      await API.post('/staff/signup', {
        restaurantId: RESTAURANT_ID,
        name:     form.name.trim(),
        email:    form.email.trim(),
        mobile:   form.mobile.trim(),
        password: form.password,
        role:     form.role,
      });
      toast.success('Registration request submitted!');
      setStep('success');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary-500 flex items-center justify-center shadow-lg shadow-primary-500/30">
            {step === 'success' ? <CheckCircle2 className="w-7 h-7 text-white" /> : <Utensils className="w-7 h-7 text-white" />}
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">
              {step === 'success' ? 'Registration Submitted' : 'Create Staff Account'}
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              {step === 'success' ? 'Waiting for admin approval' : 'Fill in your details below'}
            </p>
          </div>
        </div>

        <div className="card p-6">
          {step === 'success' ? (
            /* ── SUCCESS state ── */
            <div className="space-y-5 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center">
                <Clock className="w-8 h-8 text-amber-400" />
              </div>
              <div className="space-y-2">
                <p className="text-green-400 font-semibold">Registration request submitted successfully.</p>
                <p className="text-gray-400 text-sm">
                  Your request is waiting for administrator approval. You will be able to log in once your account is approved.
                </p>
              </div>
              <Link to="/login" className="btn-primary w-full block text-center">
                Go to Login
              </Link>
            </div>
          ) : (
            /* ── REGISTRATION FORM ── */
            <form onSubmit={handleSignup} className="space-y-4" noValidate>
              <div>
                <label className="label">Full Name</label>
                <input type="text" className="input" placeholder="Harshal Patil"
                  value={form.name} onChange={e => set('name', e.target.value)} disabled={loading} />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" placeholder="staff@restaurant.com"
                  value={form.email} onChange={e => set('email', e.target.value)} disabled={loading} />
              </div>
              <div>
                <label className="label">Mobile</label>
                <input type="tel" className="input" placeholder="+91 9876543210"
                  value={form.mobile} onChange={e => set('mobile', e.target.value)} disabled={loading} />
              </div>
              <div>
                <label className="label">Password</label>
                <input type="password" className="input" placeholder="Min. 6 characters"
                  value={form.password} onChange={e => set('password', e.target.value)} disabled={loading} />
              </div>
              <div>
                <label className="label">Confirm Password</label>
                <input type="password" className="input" placeholder="Repeat password"
                  value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} disabled={loading} />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={form.role}
                  onChange={e => set('role', e.target.value)} disabled={loading}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : 'Submit Registration Request'}
              </button>

              <p className="text-center text-xs text-gray-500">
                Already have an account?{' '}
                <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
