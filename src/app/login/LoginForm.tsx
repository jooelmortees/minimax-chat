'use client';

import { useActionState } from 'react';
import { signIn, type AuthFormState } from '@/lib/auth/actions';

interface LoginFormProps {
  next?: string;
  message?: string;
}

const INITIAL: AuthFormState = {};

export function LoginForm({ next, message }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(signIn, INITIAL);

  return (
    <form
      action={formAction}
      className="w-full max-w-sm bg-bg-elevated border border-fg/10 rounded-2xl p-6 shadow-xl flex flex-col gap-4"
    >
      <div>
        <h1 className="text-xl font-semibold">MiniMax Chat</h1>
        <p className="text-sm text-fg-muted mt-1">Inicia sesión para continuar.</p>
      </div>

      {message ? (
        <div className="text-xs bg-info/10 border border-info/30 rounded-md px-3 py-2 text-info">
          {message}
        </div>
      ) : null}

      {state.error ? (
        <div
          role="alert"
          className="text-xs bg-danger/10 border border-danger/30 rounded-md px-3 py-2 text-danger"
        >
          {state.error}
        </div>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-xs text-fg-muted">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="bg-bg border border-fg/15 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fg/30"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-fg-muted">Contraseña</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          className="bg-bg border border-fg/15 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fg/30"
        />
      </label>

      {next ? <input type="hidden" name="next" value={next} /> : null}

      <button
        type="submit"
        disabled={pending}
        className="bg-fg text-bg rounded-md px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? 'Entrando…' : 'Iniciar sesión'}
      </button>

      <p className="text-xs text-fg-muted text-center">
        El registro está deshabilitado. Pídele al admin que te dé de alta.
      </p>
    </form>
  );
}
