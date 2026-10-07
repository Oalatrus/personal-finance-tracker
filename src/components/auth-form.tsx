'use client';

import { useActionState, useState } from 'react';
import {
  authenticate,
  signOut,
  type AuthMode,
  type AuthState,
} from '@/app/auth/actions';

const labels: Record<AuthMode, string> = {
  login: 'Sign in',
  signup: 'Create account',
  'forgot-password': 'Send reset link',
  'reset-password': 'Update password',
};

export function AuthForm({ mode }: { mode: AuthMode }) {
  const [state, action, pending] = useActionState(
    authenticate.bind(null, mode),
    {} as AuthState,
  );
  const [email, setEmail] = useState('');
  const newPassword = mode === 'signup' || mode === 'reset-password';
  return (
    <form action={action} aria-busy={pending}>
      {mode !== 'reset-password' && (
        <div className="mb-3">
          <label htmlFor="email" className="form-label">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            pattern={String.raw`[^\s@]+@[^\s@]+\.[^\s@]+`}
            title="Enter an email address with @ and a dot in the domain, such as name@example.com."
            required
            maxLength={254}
            className="form-control"
          />
        </div>
      )}
      {mode !== 'forgot-password' && (
        <div className="mb-3">
          <label htmlFor="password" className="form-label">
            {newPassword ? 'New password' : 'Password'}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={newPassword ? 'new-password' : 'current-password'}
            required
            minLength={newPassword ? 10 : 1}
            pattern={newPassword ? String.raw`.*[\p{P}\p{S}].*` : undefined}
            title={
              newPassword
                ? 'Use at least 10 characters, including a symbol such as @, !, or #.'
                : undefined
            }
            maxLength={128}
            aria-describedby={newPassword ? 'password-help' : undefined}
            className="form-control"
          />
          {newPassword && (
            <div id="password-help" className="form-text">
              Use at least 10 characters, including a symbol such as @, !, or #.
            </div>
          )}
        </div>
      )}
      {newPassword && (
        <div className="mb-3">
          <label htmlFor="confirmPassword" className="form-label">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
            className="form-control"
          />
        </div>
      )}
      {state.error && (
        <p role="alert" className="alert alert-danger">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="alert alert-success">
          {state.message}
        </p>
      )}
      <button className="btn btn-primary w-100" disabled={pending}>
        {pending ? 'Please wait…' : labels[mode]}
      </button>
    </form>
  );
}

export function SignOut() {
  const [state, action, pending] = useActionState(signOut, {} as AuthState);
  return (
    <form action={action}>
      <button className="btn btn-outline-secondary btn-sm" disabled={pending}>
        {pending ? 'Signing out…' : 'Sign out'}
      </button>
      {state.error && (
        <p role="alert" className="text-danger small mb-0">
          {state.error}
        </p>
      )}
    </form>
  );
}
