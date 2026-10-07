'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { save, remove } from '@/app/(workspace)/accounts/actions';
import { accountTypes, type Account, type AccountState } from '@/lib/accounts';
import { usdInput } from '@/lib/finance/money';

export function AccountForm({
  account,
  today,
}: {
  account?: Account;
  today: string;
}) {
  const [state, action, pending] = useActionState(save, {} as AccountState);
  const fields = state.fields ?? {
    name: account?.name ?? '',
    type: account?.type ?? 'checking',
    balance: usdInput(account?.opening_balance_cents ?? 0),
    date: account?.opening_date ?? today,
    archived: account?.archived ?? false,
  };
  return (
    <section id="account-form" className="card">
      <div className="card-body p-4">
        <h2 className="h5 mb-4">
          {account ? 'Edit account' : 'Add an account'}
        </h2>
        <form
          action={action}
          aria-busy={pending}
          onReset={(event) => event.preventDefault()}
        >
          <fieldset disabled={pending}>
            <input type="hidden" name="id" value={account?.id ?? ''} />
            <div className="mb-3">
              <label htmlFor="account-name" className="form-label">
                Account name
              </label>
              <input
                id="account-name"
                name="name"
                className={`form-control${state.errors?.name ? ' is-invalid' : ''}`}
                required
                maxLength={80}
                defaultValue={fields.name}
                aria-invalid={!!state.errors?.name}
                aria-describedby={state.errors?.name ? 'name-error' : undefined}
              />
              {state.errors?.name && (
                <div id="name-error" className="invalid-feedback">
                  {state.errors.name}
                </div>
              )}
            </div>
            <div className="mb-3">
              <label htmlFor="account-type" className="form-label">
                Account type
              </label>
              <select
                id="account-type"
                name="type"
                className={`form-select${state.errors?.type ? ' is-invalid' : ''}`}
                defaultValue={fields.type}
                required
                aria-invalid={!!state.errors?.type}
                aria-describedby={state.errors?.type ? 'type-error' : undefined}
              >
                {Object.entries(accountTypes).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {state.errors?.type && (
                <div id="type-error" className="invalid-feedback">
                  {state.errors.type}
                </div>
              )}
            </div>
            <div className="mb-3">
              <label htmlFor="account-balance" className="form-label">
                Opening balance (USD)
              </label>
              <input
                id="account-balance"
                name="balance"
                type="text"
                inputMode="text"
                className={`form-control${state.errors?.balance ? ' is-invalid' : ''}`}
                defaultValue={fields.balance}
                required
                maxLength={20}
                aria-invalid={!!state.errors?.balance}
                aria-describedby="balance-help balance-error"
              />
              <div id="balance-help" className="form-text">
                Use a negative amount for money owed, such as -250.00. No commas
                or dollar sign.
              </div>
              <div id="balance-error" className="invalid-feedback">
                {state.errors?.balance}
              </div>
            </div>
            <div className="mb-3">
              <label htmlFor="account-date" className="form-label">
                Opening date
              </label>
              <input
                id="account-date"
                name="date"
                type="date"
                className={`form-control${state.errors?.date ? ' is-invalid' : ''}`}
                defaultValue={fields.date}
                min="0001-01-01"
                max="9999-12-31"
                required
                aria-invalid={!!state.errors?.date}
                aria-describedby="date-help date-error"
              />
              <div id="date-help" className="form-text">
                The date this starting balance applies to.
              </div>
              <div id="date-error" className="invalid-feedback">
                {state.errors?.date}
              </div>
            </div>
            {account && (
              <>
                <p className="small text-secondary">
                  Changing the opening balance changes this account’s starting
                  point.
                </p>
                <div className="form-check mb-3">
                  <input
                    id="account-archived"
                    name="archived"
                    type="checkbox"
                    className="form-check-input"
                    defaultChecked={fields.archived}
                  />
                  <label
                    htmlFor="account-archived"
                    className="form-check-label"
                  >
                    Archived
                  </label>
                </div>
              </>
            )}
            {state.error && (
              <p role="alert" className="alert alert-danger">
                {state.error}
              </p>
            )}
            <div className="d-flex flex-wrap gap-3 align-items-center">
              <button className="btn btn-primary" disabled={pending}>
                {pending
                  ? 'Saving…'
                  : account
                    ? 'Save changes'
                    : 'Create account'}
              </button>
              {account && (
                <Link href="/accounts" className="btn btn-outline-secondary">
                  Cancel
                </Link>
              )}
            </div>
          </fieldset>
        </form>
      </div>
    </section>
  );
}

export function DeleteAccount({ account }: { account: Account }) {
  const [state, action, pending] = useActionState(remove, {} as AccountState);
  return (
    <details className="mt-3">
      <summary className="text-danger">
        Delete account<span className="visually-hidden"> {account.name}</span>
      </summary>
      <form action={action} className="mt-3" aria-busy={pending}>
        <input type="hidden" name="id" value={account.id} />
        <p className="small">
          Delete “{account.name}”? This cannot be undone. Accounts with
          financial history cannot be deleted.
        </p>
        {state.error && (
          <p role="alert" className="alert alert-danger">
            {state.error}
          </p>
        )}
        <button className="btn btn-outline-danger btn-sm" disabled={pending}>
          {pending ? 'Deleting…' : 'Confirm deletion'}
        </button>
      </form>
    </details>
  );
}
