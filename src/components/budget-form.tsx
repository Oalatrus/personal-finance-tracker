'use client';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { save } from '@/app/(workspace)/budgets/actions';
import type { Budget, BudgetFields, BudgetState } from '@/lib/budgets';
import type { Category } from '@/lib/categories';
import { usdInput } from '@/lib/finance/money';

export function BudgetForm({
  budget,
  categories,
  month,
}: {
  budget?: Budget;
  categories: Category[];
  month: string;
}) {
  const [state, action, pending] = useActionState(save, {} as BudgetState);
  const [fields, setFields] = useState<BudgetFields>({
    category: budget?.category_id ?? '',
    month: budget?.month.slice(0, 7) ?? month,
    amount: budget ? usdInput(budget.amount_cents) : '',
  });
  const update = (name: keyof BudgetFields, value: string) =>
    setFields((previous) => ({ ...previous, [name]: value }));
  const options = categories.filter(
    (c) =>
      c.kind === 'expense' && (!c.archived || c.id === budget?.category_id),
  );
  // Cancel automatic action resets; a successful save changes the form key instead.
  return (
    <section id="budget-form" className="card card-body p-4">
      <h2 className="h5 mb-4">
        {budget ? 'Edit budget' : 'Add a monthly budget'}
      </h2>
      <form
        action={action}
        aria-busy={pending}
        onReset={(event) => event.preventDefault()}
      >
        <fieldset disabled={pending}>
          <input type="hidden" name="id" value={budget?.id ?? ''} />
          <div className="mb-3">
            <label htmlFor="budget-category" className="form-label">
              Expense category
            </label>
            <select
              id="budget-category"
              name="category"
              className="form-select"
              value={fields.category}
              onChange={(event) => update('category', event.target.value)}
              required
              aria-invalid={!!state.errors?.category}
              aria-describedby={
                state.errors?.category ? 'category-error' : undefined
              }
            >
              <option value="">Choose a category</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.archived ? ' (archived)' : ''}
                </option>
              ))}
            </select>
            {state.errors?.category && (
              <p id="category-error" className="text-danger small mt-1">
                {state.errors.category}
              </p>
            )}
            {!options.length && (
              <p className="form-text">
                Add an expense category in{' '}
                <Link href="/categories">Categories</Link> first.
              </p>
            )}
          </div>
          <div className="mb-3">
            <label htmlFor="budget-month" className="form-label">
              Budget month
            </label>
            <input
              id="budget-month"
              name="month"
              type="month"
              className="form-control"
              value={fields.month}
              onChange={(event) => update('month', event.target.value)}
              min="0001-01"
              max="9999-12"
              required
              aria-invalid={!!state.errors?.month}
              aria-describedby={state.errors?.month ? 'month-error' : undefined}
            />
            {state.errors?.month && (
              <p id="month-error" className="text-danger small mt-1">
                {state.errors.month}
              </p>
            )}
          </div>
          <div className="mb-3">
            <label htmlFor="budget-amount" className="form-label">
              Monthly limit (USD)
            </label>
            <input
              id="budget-amount"
              name="amount"
              inputMode="decimal"
              className="form-control"
              value={fields.amount}
              onChange={(event) => update('amount', event.target.value)}
              required
              maxLength={20}
              aria-invalid={!!state.errors?.amount}
              aria-describedby={`amount-help${state.errors?.amount ? ' amount-error' : ''}`}
            />
            <div id="amount-help" className="form-text">
              Enter a positive amount, such as 300.00. One budget per category
              and month.
            </div>
            {state.errors?.amount && (
              <p id="amount-error" className="text-danger small mt-1">
                {state.errors.amount}
              </p>
            )}
          </div>
          {state.error && (
            <p role="alert" className="alert alert-danger">
              {state.error}
            </p>
          )}
          <div className="d-flex flex-wrap gap-3 align-items-center">
            <button className="btn btn-primary" disabled={pending}>
              {pending ? 'Saving…' : budget ? 'Save changes' : 'Create budget'}
            </button>
            {budget && (
              <Link
                href={`/budgets?month=${month}`}
                className="btn btn-outline-secondary"
              >
                Cancel
              </Link>
            )}
          </div>
        </fieldset>
      </form>
    </section>
  );
}
