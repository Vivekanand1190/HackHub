'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Completing sign-in...');

  useEffect(() => {
    const token = searchParams.get('token');
    const userParam = searchParams.get('user');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setMessage(
        error === 'oauth_failed' ? 'Google sign-in was cancelled or failed.' :
        error === 'oauth_no_user'  ? 'Could not retrieve your Google account.' :
        'An unexpected error occurred during sign-in.'
      );
      setTimeout(() => router.replace('/'), 3000);
      return;
    }

    if (!token || !userParam) {
      setStatus('error');
      setMessage('Missing authentication data. Redirecting...');
      setTimeout(() => router.replace('/'), 3000);
      return;
    }

    try {
      const user = JSON.parse(decodeURIComponent(userParam));

      // Persist exactly like email/password login does
      localStorage.setItem('hackhub_token', token);
      localStorage.setItem('hackhub_user', JSON.stringify(user));

      setStatus('success');
      setMessage(`Welcome back, ${user.name}! 🚀`);

      // Small delay so the user sees the success state
      setTimeout(() => router.replace('/'), 1200);
    } catch {
      setStatus('error');
      setMessage('Failed to parse account data. Redirecting...');
      setTimeout(() => router.replace('/'), 3000);
    }
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-[#090d16] flex items-center justify-center">
      <div className="text-center space-y-6">
        {/* Animated Logo */}
        <div className="relative mx-auto w-20 h-20">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 animate-pulse" />
          <div className="relative flex items-center justify-center w-full h-full">
            <span className="text-3xl">⚡</span>
          </div>
        </div>

        {/* Spinner for loading */}
        {status === 'loading' && (
          <div className="flex justify-center">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Success checkmark */}
        {status === 'success' && (
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        )}

        {/* Error icon */}
        {status === 'error' && (
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
        )}

        <div>
          <p className={`text-lg font-semibold ${
            status === 'success' ? 'text-emerald-400' :
            status === 'error'   ? 'text-red-400' :
            'text-slate-300'
          }`}>
            {message}
          </p>
          {status === 'loading' && (
            <p className="text-slate-500 text-sm mt-2">
              Connecting your Google account to HackHub...
            </p>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-64 mx-auto">
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-1000 ${
              status === 'success' ? 'w-full bg-emerald-500' :
              status === 'error'   ? 'w-full bg-red-500' :
              'w-2/3 bg-indigo-500 animate-pulse'
            }`} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
