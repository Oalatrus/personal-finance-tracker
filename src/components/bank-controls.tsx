'use client';
import Script from 'next/script';
import { useActionState, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  bankAction,
  startBankLink,
  finishBankLink,
  type BankState,
} from '@/app/(workspace)/banks/actions';
type LinkSession = {
  token: string;
  id: string;
  update: boolean;
  environment: string;
};
type PlaidWindow = Window & {
  Plaid?: {
    create: (options: {
      token: string;
      receivedRedirectUri?: string;
      onSuccess: (token: string) => void;
      onExit: (error: { display_message?: string } | null) => void;
    }) => { open: () => void; destroy: () => void };
  };
};
const sessionKey = 'finance-plaid-link';

export function BankLink({
  connection,
  disabled = false,
}: {
  connection?: string;
  disabled?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function launch(session: LinkSession, receivedRedirectUri?: string) {
    const plaid = (window as PlaidWindow).Plaid;
    if (!plaid) {
      setMessage(
        'Plaid Link could not load. Check your connection and try again.',
      );
      return;
    }
    sessionStorage.setItem(sessionKey, JSON.stringify(session));
    const handler = plaid.create({
      token: session.token,
      ...(receivedRedirectUri ? { receivedRedirectUri } : {}),
      onSuccess: (publicToken) => {
        startTransition(async () => {
          try {
            const result = await finishBankLink(
              session.id,
              publicToken,
              session.update,
            );
            setMessage(result.error || result.message || 'Bank connected.');
            sessionStorage.removeItem(sessionKey);
            window.history.replaceState(null, '', '/banks');
            router.refresh();
          } catch {
            setMessage(
              'Unable to finish connecting. Check saved connections before trying again.',
            );
          } finally {
            handler.destroy();
          }
        });
      },
      onExit: (error) => {
        sessionStorage.removeItem(sessionKey);
        window.history.replaceState(null, '', '/banks');
        setMessage(
          error
            ? 'Bank connection was not completed. Try again.'
            : 'Bank connection cancelled.',
        );
        handler.destroy();
      },
    });
    handler.open();
  }
  return (
    <div>
      {!disabled && (
        <Script
          src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
          strategy="afterInteractive"
          onReady={() => {
            setReady(true);
            if (
              connection ||
              !new URLSearchParams(window.location.search).has('oauth_state_id')
            )
              return;
            const saved = sessionStorage.getItem(sessionKey);
            if (!saved) {
              setMessage(
                'Bank authorization session was lost. Start connecting again.',
              );
              return;
            }
            try {
              launch(JSON.parse(saved) as LinkSession, window.location.href);
            } catch {
              sessionStorage.removeItem(sessionKey);
              setMessage('Bank authorization session expired. Start again.');
            }
          }}
          onError={() =>
            setMessage('Plaid Link could not load. Try again later.')
          }
        />
      )}
      <button
        type="button"
        className="btn btn-primary"
        disabled={disabled || !ready || pending}
        onClick={() =>
          startTransition(async () => {
            setMessage('');
            try {
              const session = await startBankLink(connection);
              if ('error' in session) {
                setMessage(session.error || 'Unable to start Plaid Link.');
                return;
              }
              if (!('token' in session)) return;
              launch(session);
            } catch {
              setMessage('Unable to start Plaid Link. Please try again.');
            }
          })
        }
      >
        {pending
          ? 'Connecting…'
          : connection
            ? 'Reconnect bank'
            : 'Connect bank'}
      </button>
      {message && (
        <p className="mt-2 mb-0" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
export function BankForm({ children }: { children: ReactNode }) {
  const [state, action, pending] = useActionState<BankState, FormData>(
    bankAction,
    {},
  );
  return (
    <form action={action} onReset={(event) => event.preventDefault()}>
      <fieldset disabled={pending}>{children}</fieldset>
      {pending && (
        <p role="status" className="small mt-2 mb-0">
          Saving…
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-danger mt-2 mb-0">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-success mt-2 mb-0">
          {state.message}
        </p>
      )}
    </form>
  );
}
