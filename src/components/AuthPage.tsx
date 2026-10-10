import React, { useState } from 'react';
import {
  ShieldCheck,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { supabaseAuth } from '../lib/supabase.js';
import { AuthSession } from '../types/index.js';

interface AuthPageProps {
  onSuccess: (session: AuthSession) => void;
  defaultMode?: 'signin' | 'signup';
}

export const AuthPage: React.FC<AuthPageProps> = ({
  onSuccess,
  defaultMode = 'signin',
}) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage('Please enter a valid work email address.');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'forgot') {
        const res = await supabaseAuth.resetPassword(trimmedEmail);
        setInfoMessage(res.message);
        setIsLoading(false);
        return;
      }

      if (mode === 'signin') {
        if (!password) {
          setErrorMessage('Please enter your password.');
          setIsLoading(false);
          return;
        }
        const session = await supabaseAuth.signIn(trimmedEmail, password);
        onSuccess(session);
      } else if (mode === 'signup') {
        if (!password || password.length < 6) {
          setErrorMessage('Password must be at least 6 characters.');
          setIsLoading(false);
          return;
        }
        const name = fullName.trim() || trimmedEmail.split('@')[0];
        const res = await supabaseAuth.signUp(trimmedEmail, name, password);
        if (res.is_authenticated) {
          onSuccess(res);
        } else {
          setInfoMessage(res.message || 'Account created. Check your email to confirm your account.');
          setMode('signin');
        }
      }
    } catch (err: any) {
      const raw = err?.message || '';
      if (
        raw.includes('violates row-level security') ||
        raw.includes('row-level security policy') ||
        raw.includes('table "users"') ||
        raw.includes("table 'users'")
      ) {
        setErrorMessage("We couldn't finish setting up your account. Please try again.");
      } else {
        setErrorMessage(raw || 'Authentication request failed. Please check your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main
      id="auth-page-container"
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-12 selection:bg-emerald-500/30 selection:text-emerald-200"
    >
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <header className="text-center mb-8">
          <div
            id="auth-brand-logo"
            className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500 text-slate-950 font-bold mb-4 shadow-lg shadow-emerald-500/20"
          >
            <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Revenue Recovery OS
          </h1>
          <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
            Automated failed payment recovery &amp; subscription retention
          </p>
        </header>

        {/* Card Container */}
        <div
          id="auth-card"
          className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm"
        >
          {/* Top Toggle for Sign In / Create Account */}
          {mode !== 'forgot' ? (
            <div
              id="auth-mode-selector"
              className="grid grid-cols-2 p-1 bg-slate-950 border border-slate-800/80 rounded-xl mb-6"
            >
              <button
                type="button"
                id="btn-tab-signin"
                onClick={() => {
                  setMode('signin');
                  setErrorMessage(null);
                  setInfoMessage(null);
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  mode === 'signin'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                id="btn-tab-signup"
                onClick={() => {
                  setMode('signup');
                  setErrorMessage(null);
                  setInfoMessage(null);
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  mode === 'signup'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Create Account
              </button>
            </div>
          ) : (
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Reset Password</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Enter your email to receive a password reset link
                </p>
              </div>
              <button
                type="button"
                id="btn-back-to-signin"
                onClick={() => {
                  setMode('signin');
                  setErrorMessage(null);
                  setInfoMessage(null);
                }}
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300 cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          )}

          {/* Feedback Messages */}
          {errorMessage && (
            <div
              id="auth-error-alert"
              role="alert"
              className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-start gap-2.5 animate-fadeIn"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span className="leading-snug">{errorMessage}</span>
            </div>
          )}

          {infoMessage && (
            <div
              id="auth-info-alert"
              role="status"
              className="mb-5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs flex items-start gap-2.5 animate-fadeIn"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <span className="leading-snug">{infoMessage}</span>
            </div>
          )}

          {/* Auth Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label
                  htmlFor="auth-fullname-input"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="auth-fullname-input"
                    type="text"
                    autoComplete="name"
                    required
                    placeholder="Alex Morgan"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email-input"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="auth-email-input"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="auth-password-input"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Password
                  </label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      id="btn-forgot-password"
                      onClick={() => {
                        setMode('forgot');
                        setErrorMessage(null);
                        setInfoMessage(null);
                      }}
                      className="text-xs text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="auth-password-input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    required
                    minLength={6}
                    placeholder={mode === 'signup' ? 'At least 6 characters' : 'Enter your password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                  <button
                    type="button"
                    id="btn-toggle-password-visibility"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer focus:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              id="auth-submit-btn"
              disabled={isLoading}
              className="w-full mt-2 py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-lg shadow-emerald-500/10"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {mode === 'signin'
                      ? 'Signing In...'
                      : mode === 'signup'
                      ? 'Creating Account...'
                      : 'Sending Instructions...'}
                  </span>
                </>
              ) : (
                <>
                  <span>
                    {mode === 'signin'
                      ? 'Sign In to Workspace'
                      : mode === 'signup'
                      ? 'Get Started'
                      : 'Send Reset Link'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Social Proof / Security Footer */}
          <div className="mt-6 pt-5 border-t border-slate-800 text-center">
            <p className="text-[11px] text-slate-500">
              Enterprise-grade encryption • SOC2 &amp; PCI-DSS ready security
            </p>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-slate-500 mt-6">
          By continuing, you agree to our Terms of Service &amp; Privacy Policy.
        </p>
      </div>
    </main>
  );
};
