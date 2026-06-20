'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { homePortal } from '@/lib/auth/roles';

export default function LoginPage() {
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]             = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const { login } = useAuth();
  const router    = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const result = await login(email, password);
    if (result.success) {
      router.push(`/${homePortal(result.role ?? 'SENDING_AGENT')}`);
    } else {
      setError(result.error || 'Invalid email or password.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel — brand ─────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col bg-[#0f172a] relative overflow-hidden select-none">

        {/* Subtle geometric accents */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-blue-600/10 border-l border-b border-blue-500/20" />
        <div className="absolute bottom-0 left-0 w-52 h-52 bg-blue-600/8 border-t border-r border-blue-500/15" />
        <div className="absolute inset-x-0 top-[45%] h-px bg-white/5" />

        <div className="relative flex-1 flex flex-col justify-center px-10 xl:px-16 pb-16 pt-16">
          <p className="text-blue-400 text-xs font-semibold uppercase tracking-[0.18em] mb-5">
            Canada — Ghana Remittance
          </p>
          <h1 className="text-white text-4xl xl:text-5xl font-bold leading-[1.15] tracking-tight">
            Move money<br />with speed and<br />
            <span className="text-blue-400">trust.</span>
          </h1>
          <p className="mt-6 text-slate-400 text-base leading-relaxed max-w-sm">
            A secure, end-to-end remittance management platform — sending, receiving, reconciliation and accounting in one place.
          </p>

          <div className="mt-12 flex items-center gap-10">
            {[
              { value: 'Instant',    label: 'Sync' },
              { value: 'Multi-till', label: 'Support' },
              { value: 'Full',       label: 'Audit Trail' },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-white text-sm font-bold">{s.value}</p>
                <p className="text-slate-500 text-xs mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative px-10 pb-8">
          <p className="text-slate-600 text-xs">© {new Date().getFullYear()} Petros Remittance</p>
        </div>
      </div>

      {/* ── Right panel — form ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-slate-50">
        <div className="flex-1 flex flex-col justify-center px-4 sm:px-8 lg:px-14 xl:px-20 py-10">
          <div className="w-full max-w-sm mx-auto lg:mx-0">

            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome back</h2>
              <p className="mt-1.5 text-sm text-gray-500">Sign in to your Petros Remittance account</p>
            </div>

            <div className="bg-white shadow-sm ring-1 ring-black/5 p-6 sm:p-7">

              {error && (
                <div className="mb-5 flex items-start gap-2.5 border border-red-200 bg-red-50 px-3.5 py-3">
                  <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@petrosremittance.com"
                    required
                    autoComplete="email"
                    className="block w-full h-11 border border-gray-300 bg-white px-3.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 transition"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium transition"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      className="block w-full h-11 border border-gray-300 bg-white px-3.5 pr-11 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 transition"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 hover:text-gray-600 transition"
                    >
                      {showPassword ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign in
                      <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </button>
              </form>
            </div>

            <p className="mt-5 text-xs text-gray-400 text-center">
              Authorised staff only — contact your administrator for access.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
