import { Eye, EyeOff, Lock, Mail, Phone, Tag, User, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { PublicUser } from '../types';

interface AuthModalProps {
  open: boolean;
  initialMode: 'login' | 'register';
  onClose: () => void;
  onSuccess: (token: string, user: PublicUser) => void;
}

export function AuthModal({ open, initialMode, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setError(null);
  }, [initialMode, open]);

  if (!open) return null;

  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const payload =
        mode === 'register'
          ? { fullName, phone, email, password, promoCode: promoCode.trim() || undefined }
          : { identifier, password, promoCode: promoCode.trim() || undefined };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as {
        token?: string;
        user?: PublicUser;
        error?: string;
      };

      if (!res.ok || !data.token || !data.user) {
        setError(data.error || 'Authentication failed. Please check your details.');
        return;
      }

      onSuccess(data.token, data.user);
      onClose();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#12161f] p-6 shadow-2xl max-h-[92vh] overflow-y-auto arena-scroll">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 id="auth-modal-title" className="font-display text-xl font-bold text-white">
              {mode === 'register' ? 'Create Account' : 'Welcome Back'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {mode === 'register'
                ? 'Join BETKENYA 254 Aviator. Deposit min KES 200 to fly.'
                : 'Log in with your Kenyan phone number or email.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#181d28] text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-[#0b0d12] p-1 border border-white/5">
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`rounded-md py-2 text-xs font-semibold transition-colors cursor-pointer ${
              mode === 'register' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`rounded-md py-2 text-xs font-semibold transition-colors cursor-pointer ${
              mode === 'login' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Login
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-950/50 px-3.5 py-2.5 text-xs font-medium text-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Full Name</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Brian Kamau"
                    className="w-full rounded-lg border border-white/10 bg-[#0b0d12] py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Phone Number (Kenya +254)
                </label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0712 345 678 or +254712345678"
                    className="w-full rounded-lg border border-white/10 bg-[#0b0d12] py-2.5 pl-9 pr-3 font-mono text-sm text-white placeholder:font-sans placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Email Address</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-white/10 bg-[#0b0d12] py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
                  />
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Phone Number or Email
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="0712345678 or you@example.com"
                  className="w-full rounded-lg border border-white/10 bg-[#0b0d12] py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full rounded-lg border border-white/10 bg-[#0b0d12] py-2.5 pl-9 pr-10 text-sm text-white placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full rounded-lg border border-white/10 bg-[#0b0d12] py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Optional Promo Code (Zero hints!) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Promo Code <span className="text-slate-500">(Optional)</span>
            </label>
            <div className="relative">
              <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="Enter promo code"
                autoComplete="off"
                className="w-full rounded-lg border border-white/10 bg-[#0b0d12] py-2.5 pl-9 pr-3 font-mono text-sm uppercase text-white placeholder:normal-case placeholder:font-sans placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-xl bg-rose-600 py-3 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-60 transition-colors cursor-pointer"
          >
            {submitting
              ? 'Please wait...'
              : mode === 'register'
              ? 'Create Account'
              : 'Log In to BETKENYA 254'}
          </button>
        </form>
      </div>
    </div>
  );
}
