'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { save, remove } from '@/app/(workspace)/categories/actions';
import type { Category, CategoryState } from '@/lib/categories';

export function CategoryForm({ category }: { category?: Category }) {
  const [state, action, pending] = useActionState(save, {} as CategoryState);
  const fields = state.fields ?? {
    name: category?.name ?? '',
    kind: category?.kind ?? 'expense',
    archived: category?.archived ?? false,
  };
  return (
    <section id="category-form" className="card">
      <div className="card-body p-4">
        <h2 className="h5 mb-4">
          {category ? 'Edit category' : 'Add a category'}
        </h2>
        <form
          action={action}
          aria-busy={pending}
          onReset={(event) => event.preventDefault()}
        >
          <fieldset disabled={pending}>
            <input type="hidden" name="id" value={category?.id ?? ''} />
            <div className="mb-3">
              <label htmlFor="category-name" className="form-label">
                Category name
              </label>
              <input
                id="category-name"
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
              <label htmlFor="category-kind" className="form-label">
                Category type
              </label>
              <select
                id="category-kind"
                name="kind"
                className={`form-select${state.errors?.kind ? ' is-invalid' : ''}`}
                required
                defaultValue={fields.kind}
                aria-invalid={!!state.errors?.kind}
                aria-describedby="kind-help kind-error"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              <div id="kind-help" className="form-text">
                For example, Groceries for expenses or Salary for income. A
                category’s type cannot change once used by transactions or
                budgets.
              </div>
              <div id="kind-error" className="invalid-feedback">
                {state.errors?.kind}
              </div>
            </div>
            {category && (
              <div className="form-check mb-3">
                <input
                  id="category-archived"
                  name="archived"
                  type="checkbox"
                  className="form-check-input"
                  defaultChecked={fields.archived}
                  aria-describedby="archive-help"
                />
                <label htmlFor="category-archived" className="form-check-label">
                  Archived
                </label>
                <div id="archive-help" className="form-text">
                  Retire this category while keeping its financial history.
                  Uncheck to restore it.
                </div>
              </div>
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
                  : category
                    ? 'Save changes'
                    : 'Create category'}
              </button>
              {category && (
                <Link href="/categories" className="btn btn-outline-secondary">
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

export function DeleteCategory({ category }: { category: Category }) {
  const [state, action, pending] = useActionState(remove, {} as CategoryState);
  return (
    <details className="mt-3">
      <summary className="text-danger">
        Delete category<span className="visually-hidden"> {category.name}</span>
      </summary>
      <form action={action} className="mt-3" aria-busy={pending}>
        <input type="hidden" name="id" value={category.id} />
        <p className="small">
          Delete “{category.name}”? This cannot be undone. Categories used by
          transactions or budgets cannot be deleted.
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
