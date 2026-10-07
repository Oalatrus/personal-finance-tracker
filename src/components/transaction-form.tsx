'use client';

import Link from 'next/link';
import { useActionState, useState, type ReactNode } from 'react';
import { save, remove } from '@/app/(workspace)/transactions/actions';
import type { Account } from '@/lib/accounts';
import type { Category } from '@/lib/categories';
import {
  transactionKinds,
  type Transaction,
  type TransactionFields,
  type TransactionState,
} from '@/lib/transactions';
import { usdInput } from '@/lib/finance/money';

function Field({
  name,
  label,
  error,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-3">
      <label htmlFor={`transaction-${name}`} className="form-label">
        {label}
      </label>
      {children}
      {error && (
        <div id={`${name}-error`} className="text-danger small mt-1">
          {error}
        </div>
      )}
    </div>
  );
}

export function TransactionForm({
  transaction,
  accounts,
  categories,
  today,
  returnTo,
}: {
  transaction?: Transaction;
  accounts: Account[];
  categories: Category[];
  today: string;
  returnTo: string;
}) {
  const [state, action, pending] = useActionState(save, {} as TransactionState);
  const [fields, setFields] = useState<TransactionFields>({
    kind: transaction?.kind ?? 'expense',
    account: transaction?.account_id ?? '',
    destination: transaction?.destination_account_id ?? '',
    category: transaction?.category_id ?? '',
    amount: transaction ? usdInput(transaction.amount_cents) : '',
    date: transaction?.transaction_date ?? today,
    description: transaction?.description ?? '',
  });
  const set = (name: keyof TransactionFields, value: string) =>
    setFields((previous) => ({ ...previous, [name]: value }));
  const props = (name: keyof TransactionFields) => ({
    id: `transaction-${name}`,
    name,
    value: fields[name],
    'aria-invalid': !!state.errors?.[name],
    'aria-describedby': state.errors?.[name] ? `${name}-error` : undefined,
    onChange: (event: { target: { value: string } }) =>
      set(name, event.target.value),
  });
  const accountOptions = (existingId?: string | null) =>
    accounts
      .filter((a) => !a.archived || a.id === existingId)
      .map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
          {a.archived ? ' (archived)' : ''}
        </option>
      ));
  const categoryOptions = categories.filter(
    (c) =>
      c.kind === fields.kind &&
      (!c.archived || c.id === transaction?.category_id),
  );
  return (
    <section id="transaction-form" className="card">
      <div className="card-body p-4">
        <h2 className="h5 mb-4">
          {transaction ? 'Edit transaction' : 'Add a transaction'}
        </h2>
        <form
          action={action}
          aria-busy={pending}
          onReset={(event) => event.preventDefault()}
        >
          <fieldset disabled={pending}>
            <input type="hidden" name="id" value={transaction?.id ?? ''} />
            <input
              type="hidden"
              name="filters"
              value={returnTo.split('?')[1] ?? ''}
            />
            <Field
              name="kind"
              label="Transaction type"
              error={state.errors?.kind}
            >
              <select
                {...props('kind')}
                className="form-select"
                required
                onChange={(event) => {
                  const kind = event.target.value;
                  setFields((previous) => ({
                    ...previous,
                    kind,
                    category: '',
                    destination: '',
                  }));
                }}
              >
                {Object.entries(transactionKinds).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              name="account"
              label={fields.kind === 'transfer' ? 'From account' : 'Account'}
              error={state.errors?.account}
            >
              <select {...props('account')} className="form-select" required>
                <option value="">Choose an account</option>
                {accountOptions(transaction?.account_id)}
              </select>
            </Field>
            {fields.kind === 'transfer' ? (
              <Field
                name="destination"
                label="To account"
                error={state.errors?.destination}
              >
                <select
                  {...props('destination')}
                  className="form-select"
                  required
                >
                  <option value="">Choose a destination</option>
                  {accountOptions(transaction?.destination_account_id)}
                </select>
              </Field>
            ) : (
              <Field
                name="category"
                label="Category"
                error={state.errors?.category}
              >
                <select {...props('category')} className="form-select" required>
                  <option value="">Choose a category</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.archived ? ' (archived)' : ''}
                    </option>
                  ))}
                </select>
                {!categoryOptions.length && (
                  <p className="form-text">
                    Add an {fields.kind} category in{' '}
                    <Link href="/categories">Categories</Link> first.
                  </p>
                )}
              </Field>
            )}
            <Field
              name="amount"
              label="Amount (USD)"
              error={state.errors?.amount}
            >
              <input
                {...props('amount')}
                className="form-control"
                inputMode="decimal"
                required
                maxLength={20}
              />
              <div className="form-text">
                Enter a positive amount, such as 25.50.
              </div>
            </Field>
            <Field
              name="date"
              label="Transaction date"
              error={state.errors?.date}
            >
              <input
                {...props('date')}
                className="form-control"
                type="date"
                min="0001-01-01"
                max="9999-12-31"
                required
              />
            </Field>
            <Field
              name="description"
              label="Description (optional)"
              error={state.errors?.description}
            >
              <textarea
                {...props('description')}
                className="form-control"
                rows={2}
                maxLength={500}
              />
            </Field>
            {state.error && (
              <p role="alert" className="alert alert-danger">
                {state.error}
              </p>
            )}
            <div className="d-flex flex-wrap gap-3 align-items-center">
              <button className="btn btn-primary" disabled={pending}>
                {pending
                  ? 'Saving…'
                  : transaction
                    ? 'Save changes'
                    : 'Create transaction'}
              </button>
              {transaction && (
                <Link href={returnTo} className="btn btn-outline-secondary">
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

export function DeleteTransaction({
  transaction,
  returnTo,
}: {
  transaction: Transaction;
  returnTo: string;
}) {
  const [state, action, pending] = useActionState(
    remove,
    {} as TransactionState,
  );
  return (
    <details className="mt-3">
      <summary className="text-danger">Delete transaction</summary>
      <form action={action} className="mt-3" aria-busy={pending}>
        <input type="hidden" name="id" value={transaction.id} />
        <input
          type="hidden"
          name="filters"
          value={returnTo.split('?')[1] ?? ''}
        />
        <p className="small">
          Delete this transaction? This cannot be undone.
          {transaction.kind === 'transfer'
            ? ' Both sides of the transfer will be removed.'
            : ''}
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
