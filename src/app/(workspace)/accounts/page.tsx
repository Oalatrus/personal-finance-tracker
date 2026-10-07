import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountForm, DeleteAccount } from '@/components/account-form';
import { listAccounts } from '@/lib/data/accounts';
import { accountTypes } from '@/lib/accounts';
import { formatUsd } from '@/lib/finance/money';

export const metadata: Metadata = {
  title: 'Accounts | Personal Finance Tracker',
};
const notices: Record<string, string> = {
  created: 'Account created.',
  updated: 'Account updated.',
  deleted: 'Account deleted.',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; notice?: string }>;
}) {
  const query = await searchParams;
  const { data: accounts, error } = await listAccounts();
  const editing = accounts?.find((account) => account.id === query.edit);
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">YOUR WORKSPACE</p>
        <h1>Accounts</h1>
        <p className="text-secondary mb-0">
          Keep your starting balances in one place. All amounts are in USD.
        </p>
      </header>
      {query.notice && Object.hasOwn(notices, query.notice) && (
        <p role="status" className="alert alert-success">
          {notices[query.notice]}
        </p>
      )}
      {error ? (
        <div role="alert" className="alert alert-danger">
          Unable to load your accounts. <Link href="/accounts">Try again</Link>.
        </div>
      ) : (
        <>
          {query.edit && !editing && (
            <p role="alert" className="alert alert-warning">
              That account is unavailable. Choose an account from the list.
            </p>
          )}
          <div className="row g-4">
            <div className="col-12 col-xl-7">
              {!accounts?.length ? (
                <section className="card">
                  <div className="card-body p-4">
                    <h2 className="h5">Add your first account</h2>
                    <p className="text-secondary mb-0">
                      Start with checking, savings, cash, or a credit card.
                      Enter its balance and the date that balance applies to.
                    </p>
                  </div>
                </section>
              ) : (
                <div className="d-grid gap-3">
                  {accounts.map((account) => (
                    <article className="card" key={account.id}>
                      <div className="card-body p-4">
                        <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                          <div className="text-break">
                            <h2 className="h5 mb-1">{account.name}</h2>
                            <span className="small text-secondary">
                              {
                                accountTypes[
                                  account.type as keyof typeof accountTypes
                                ]
                              }
                            </span>
                            {account.archived && (
                              <span className="badge text-bg-secondary ms-2">
                                Archived
                              </span>
                            )}
                          </div>
                          <Link
                            href={`/accounts?edit=${account.id}#account-form`}
                            className="btn btn-outline-primary btn-sm"
                            aria-label={`Edit ${account.name}`}
                          >
                            Edit
                          </Link>
                        </div>
                        <p className="fs-3 fw-semibold mt-3 mb-1 text-break">
                          {formatUsd(account.opening_balance_cents)}
                        </p>
                        <p className="small text-secondary mb-0">
                          Opening balance ·{' '}
                          <time dateTime={account.opening_date}>
                            {new Intl.DateTimeFormat('en-US', {
                              dateStyle: 'medium',
                              timeZone: 'UTC',
                            }).format(
                              new Date(`${account.opening_date}T00:00:00Z`),
                            )}
                          </time>
                        </p>
                        <DeleteAccount account={account} />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <div className="col-12 col-xl-5">
              <AccountForm
                key={editing?.id ?? `new-${accounts?.length ?? 0}`}
                account={editing}
                today={new Date().toISOString().slice(0, 10)}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
