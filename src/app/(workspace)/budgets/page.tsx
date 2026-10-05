import type { Metadata } from 'next';
import Link from 'next/link';
import { listBudgets } from '@/lib/data/budgets';
import { listCategories } from '@/lib/data/categories';
import { validMonth } from '@/lib/budgets';
import { BudgetForm } from '@/components/budget-form';
import { formatUsd } from '@/lib/finance/money';
import type { SearchParams } from '@/lib/transactions';

export const metadata: Metadata = {
  title: 'Budgets | Personal Finance Tracker',
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const month =
    typeof query.month === 'string'
      ? query.month
      : new Date().toISOString().slice(0, 7);
  if (!validMonth(month))
    return (
      <>
        <h1>Budgets</h1>
        <p role="alert" className="alert alert-danger">
          Choose a valid month.{' '}
          <Link href="/budgets">Return to this month</Link>.
        </p>
      </>
    );
  const [budgets, categories] = await Promise.all([
    listBudgets(month),
    listCategories(),
  ]);
  const editing = budgets.data?.find((b) => b.id === query.edit);
  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">YOUR WORKSPACE</p>
        <h1>Budgets</h1>
        <p className="text-secondary mb-0">
          Plan your spending, one month at a time.
        </p>
      </header>
      <form
        key={month}
        action="/budgets"
        method="get"
        className="d-flex flex-wrap gap-3 align-items-end mb-4"
      >
        <div>
          <label htmlFor="view-month" className="form-label">
            View month
          </label>
          <input
            id="view-month"
            name="month"
            type="month"
            defaultValue={month}
            min="0001-01"
            max="9999-12"
            required
            className="form-control"
          />
        </div>
        <button className="btn btn-outline-primary">Show month</button>
      </form>
      {(query.notice === 'created' || query.notice === 'updated') && (
        <p role="status" className="alert alert-success">
          Budget {query.notice}.
        </p>
      )}
      {budgets.error || categories.error ? (
        <p role="alert" className="alert alert-danger">
          Unable to load budgets.{' '}
          <Link href={`/budgets?month=${month}`}>Try again</Link>.
        </p>
      ) : (
        <>
          {query.edit && !editing && (
            <p role="alert" className="alert alert-warning">
              That budget is unavailable in this month. Choose a budget from the
              list.
            </p>
          )}
          <div className="row g-4">
            <div className="col-12 col-xl-7">
              <h2 className="h5 mb-3">{monthLabel}</h2>
              {budgets.data?.length ? (
                <div className="d-grid gap-3">
                  {budgets.data.map((b) => {
                    const category = categories.data?.find(
                      (c) => c.id === b.category_id,
                    );
                    return (
                      <article key={b.id} className="card card-body p-4">
                        <div className="d-flex justify-content-between gap-3 flex-wrap">
                          <div className="text-break">
                            <h3 className="h5">
                              {category?.name ?? 'Unavailable category'}
                            </h3>
                            {category?.archived && (
                              <span className="badge text-bg-secondary">
                                Archived category
                              </span>
                            )}
                            <p className="fs-3 fw-semibold mt-2 mb-1 text-break">
                              {formatUsd(b.amount_cents)}
                            </p>
                            <p className="small text-secondary mb-0">
                              Monthly spending limit
                            </p>
                          </div>
                          <Link
                            href={`/budgets?month=${month}&edit=${b.id}#budget-form`}
                            className="btn btn-outline-primary btn-sm align-self-start"
                            aria-label={`Edit ${category?.name ?? 'budget'}`}
                          >
                            Edit
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <section className="card card-body p-4">
                  <h3 className="h5">Make a plan for {monthLabel}</h3>
                  <p className="text-secondary mb-0">
                    Set a spending limit for an expense category to create your
                    first budget for this month.
                  </p>
                </section>
              )}
            </div>
            <div className="col-12 col-xl-5">
              <BudgetForm
                key={editing?.id ?? `new-${month}-${budgets.data?.length ?? 0}`}
                budget={editing}
                categories={categories.data ?? []}
                month={month}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
