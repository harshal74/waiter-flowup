import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Utensils, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import API, { RESTAURANT_ID } from '../lib/api';
import toast from 'react-hot-toast';
import type { StaffRole } from '../types';

const ROLES: StaffRole[] = ['CHEF', 'WAITER', 'ASSISTANT'];

type Step = 'form' | 'otp';

export default function SignupPage() {
  const [step,    setStep]    = useState<Step>('form');
  const [email,   setEmailState] = useState('');          // persisted between steps
  const [form, setForm] = useState({
    name: '', email: '', mobile: '', password: '', confirmPassword: '',
    role: 'WAITER' as StaffRole,
  });
  const [otp,       setOtp]       = useState('');
  const [loading,   setLoading]   = useState(false);
  const [resending, setResending] = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  // ── Step 1: submit signup form ──────────────────────────────────
  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // Client-side validation
    const fields = ['name','email','mobile','password','role'] as const;
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
    if (form.confirmPassword && form.password !== form.confirmPassword) {
      setError('Passwords do not match'); return;
    }

    setLoading(true);
    try {
      const res = await API.post('/staff/signup', {
        restaurantId: RESTAURANT_ID,
        name:     form.name.trim(),
        email:    form.email.trim(),
        mobile:   form.mobile.trim(),
        password: form.password,
        role:     form.role,
      });
      setEmailState(form.email.trim().toLowerCase());

      // If email delivery failed, show a warning but still proceed to OTP step
      if (res.data.emailError) {
        toast('Email delivery failed — check the backend terminal for your OTP code.', {
          icon: '⚠️', duration: 8000,
        });
      } else if (res.data.devNote) {
        toast('No email configured — check your backend terminal for the OTP code.', {
          icon: '🖥️', duration: 8000,
        });
      } else {
        toast.success('OTP sent! Check your email.');
      }
      setStep('otp');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: verify OTP ──────────────────────────────────────────
  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedOtp = otp.replace(/\s/g, '');
    if (!trimmedOtp || !/^\d{6}$/.test(trimmedOtp)) {
      setError('Please enter the 6-digit OTP from your email'); return;
    }

    setLoading(true);
    try {
      const res = await API.post('/staff/verify-otp', { email, otp: trimmedOtp });
      setSuccess(res.data.message || 'Email verified!');
      toast.success('Email verified! You can now log in.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Resend OTP ──────────────────────────────────────────────────
  const handleResend = async () => {
    if (resending) return;
    setResending(true);
    setError('');
    try {
      await API.post('/staff/resend-otp', { email });
      toast.success('New OTP sent to your email');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to resend OTP');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary-500 flex items-center justify-center shadow-lg shadow-primary-500/30">
            {step === 'otp' ? <ShieldCheck className="w-7 h-7 text-white" /> : <Utensils className="w-7 h-7 text-white" />}
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">
              {step === 'otp' ? 'Verify Your Email' : 'Create Staff Account'}
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              {step === 'otp' ? `OTP sent to ${email}` : 'Fill in your details below'}
            </p>
          </div>
        </div>

        <div className="card p-6">
          {/* ── SUCCESS state ── */}
          {success ? (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-green-400" />
              </div>
              <p className="text-green-400 font-semibold">{success}</p>
              <Link to="/login" className="btn-primary w-full block text-center">
                Go to Login
              </Link>
            </div>
          ) : step === 'form' ? (
            /* ── STEP 1: Signup form ── */
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
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending OTP…</> : 'Create Account'}
              </button>

              <p className="text-center text-xs text-gray-500">
                Already have an account?{' '}
                <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium">
                  Sign in
                </Link>
              </p>
            </form>
          ) : (
            /* ── STEP 2: OTP verification ── */
            <form onSubmit={handleVerify} className="space-y-5" noValidate>
              <p className="text-sm text-gray-400 text-center">
                Enter the 6-digit code sent to <strong className="text-white">{email}</strong>
              </p>

              <div>
                <label className="label text-center">OTP Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className="input text-center text-2xl font-mono tracking-[0.4em]"
                  placeholder="• • • • • •"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={loading}
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-center">
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading || otp.length !== 6} className="btn-primary w-full">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</> : 'Verify Email'}
              </button>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <button
                  type="button"
                  onClick={() => { setStep('form'); setOtp(''); setError(''); }}
                  className="hover:text-gray-300 transition-colors"
                >
                  ← Change email
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="flex items-center gap-1 text-primary-400 hover:text-primary-300 transition-colors disabled:opacity-50"
                >
                  {resending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Resend OTP
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
