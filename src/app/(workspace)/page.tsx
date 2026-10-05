import Link from 'next/link';
import { getDashboard } from '@/lib/data/dashboard';
import { SpendingChart } from '@/components/spending-chart';
import { formatUsd } from '@/lib/finance/money';
import { validDate, type SearchParams } from '@/lib/transactions';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from =
    typeof query.from === 'string' ? query.from : `${today.slice(0, 7)}-01`;
  const to = typeof query.to === 'string' ? query.to : today;
  const valid = validDate(from) && validDate(to) && from <= to;
  let dashboard: Awaited<ReturnType<typeof getDashboard>> | undefined;
  let error = valid
    ? ''
    : 'Choose valid dates, with the end date on or after the start date.';
  if (valid) {
    try {
      dashboard = await getDashboard({ from, to });
    } catch {
      error =
        'Unable to calculate your dashboard. Please reload and try again.';
    }
  }
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">THE BIG PICTURE</p>
        <h1>Your money, at a glance.</h1>
        <p className="text-secondary mb-0">
          Your balances and spending, in USD.
        </p>
      </header>
      <form
        key={`${from}:${to}`}
        action="/"
        method="get"
        className="row g-3 align-items-end mb-4"
        aria-label="Dashboard dates"
      >
        <div className="col-6 col-md-3">
          <label htmlFor="dashboard-from" className="form-label">
            From date
          </label>
          <input
            id="dashboard-from"
            name="from"
            type="date"
            className="form-control"
            defaultValue={from}
            min="0001-01-01"
            max="9999-12-31"
            required
          />
        </div>
        <div className="col-6 col-md-3">
          <label htmlFor="dashboard-to" className="form-label">
            Through date
          </label>
          <input
            id="dashboard-to"
            name="to"
            type="date"
            className="form-control"
            defaultValue={to}
            min="0001-01-01"
            max="9999-12-31"
            required
          />
        </div>
        <div className="col-12 col-md-auto d-flex align-items-center gap-3">
          <button className="btn btn-primary">Apply dates</button>
          <Link href="/">This month</Link>
        </div>
      </form>
      {error && (
        <p role="alert" className="alert alert-danger">
          {error} <Link href="/">Reset dashboard</Link>
        </p>
      )}
      {dashboard && (
        <>
          {!dashboard.hasAccounts && (
            <section className="alert alert-info">
              <h2 className="h5">Start with your first account</h2>
              <p>
                Add an opening balance, then record your income and expenses.
              </p>
              <Link href="/accounts" className="btn btn-primary">
                Add an account
              </Link>
            </section>
          )}
          <div className="row g-3 mb-4">
            {[
              {
                label: 'Total balance',
                amount: dashboard.balanceCents,
                note: `As of ${to} · Includes opening balances and archived accounts`,
              },
              {
                label: 'Income',
                amount: dashboard.incomeCents,
                note: `${from} through ${to}`,
              },
              {
                label: 'Expenses',
                amount: dashboard.expenseCents,
                note: `${from} through ${to}`,
              },
              {
                label: 'Net income',
                amount: dashboard.netIncomeCents,
                note: 'Income minus expenses · Transfers excluded',
              },
            ].map((card, index) => (
              <div className="col-12 col-sm-6 col-xl-3" key={card.label}>
                <section
                  aria-label={card.label}
                  className={`card summary-card h-100${index === 0 ? ' balance-card' : ''}`}
                >
                  <div className="card-body">
                    <h2 className="summary-label">{card.label}</h2>
                    <p className="summary-value text-break">
                      {formatUsd(card.amount)}
                    </p>
                    <p className="small mb-0">{card.note}</p>
                  </div>
                </section>
              </div>
            ))}
          </div>
          <div className="row g-4">
            <div className="col-12 col-xl-8">
              <section className="card h-100">
                <div className="card-body p-4">
                  <h2 className="h5">Spending by category</h2>
                  <p className="small text-secondary">
                    Expenses from {from} through {to}. Transfers are excluded.
                  </p>
                  {dashboard.spending.length ? (
                    <SpendingChart spending={dashboard.spending} />
                  ) : (
                    <div className="py-5 text-center">
                      <h3 className="h5">No spending in this period</h3>
                      <p className="text-secondary">
                        Record an expense or choose different dates.
                      </p>
                      <Link href="/transactions">Add a transaction</Link>
                    </div>
                  )}
                </div>
              </section>
            </div>
            <div className="col-12 col-xl-4">
              <section className="card h-100">
                <div className="card-body p-4">
                  <h2 className="h5">Account balances</h2>
                  <p className="small text-secondary">
                    As of {to}. Negative balances represent money owed.
                  </p>
                  {dashboard.accounts.length ? (
                    <ul className="list-unstyled mb-4">
                      {dashboard.accounts.map((a) => (
                        <li
                          key={a.accountId}
                          className="d-flex flex-wrap justify-content-between gap-2 py-3 border-bottom"
                        >
                          <span className="text-break">
                            {a.name}
                            {a.archived && (
                              <span className="small text-secondary">
                                {' '}
                                (archived)
                              </span>
                            )}
                          </span>
                          <span className="fw-semibold text-break">
                            {formatUsd(a.balanceCents)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-secondary">
                      No accounts opened by this date.
                    </p>
                  )}
                  <div className="d-flex flex-wrap gap-3">
                    <Link href="/accounts">Manage accounts</Link>
                    <Link href="/transactions">Transactions</Link>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
