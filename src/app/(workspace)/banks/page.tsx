import Link from 'next/link';
import { BankForm, BankLink } from '@/components/bank-controls';
import { requireUser } from '@/lib/supabase/user';
import { createClient } from '@/lib/supabase/server';
import { plaidReady } from '@/lib/plaid/client';
import { formatUsd } from '@/lib/finance/money';

export const maxDuration = 60;

export default async function BanksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const db = await createClient();
  const query = await searchParams;
  const parsed = Number(query.page);
  const page =
    Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 100000 ? parsed : 1;
  const ready = plaidReady();
  const [connections, mappings, accounts, categories, records, pending] =
    await Promise.all([
      db
        .from('plaid_connections')
        .select('id,institution,environment,disconnected,last_synced_at')
        .eq('user_id', user.id)
        .order('created_at'),
      db.from('plaid_accounts').select('*').eq('user_id', user.id),
      db
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('archived', false)
        .order('name'),
      db
        .from('categories')
        .select('*')
        .eq('user_id', user.id)
        .eq('archived', false)
        .order('name'),
      db
        .from('plaid_records')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('needs_review', true)
        .eq('pending', false)
        .order('transaction_date', { ascending: false })
        .order('provider_id')
        .order('connection_id')
        .range((page - 1) * 25, page * 25 - 1),
      db
        .from('plaid_records')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('pending', true)
        .eq('removed', false),
    ]);
  if (
    [connections, mappings, accounts, categories, records, pending].some(
      (r) => r.error,
    )
  )
    throw new Error('Unable to load bank connections.');
  const rows = records.data || [];
  const reviewRows = await Promise.all(
    rows.map(async (row) => {
      const mapping = mappings.data?.find(
        (a) =>
          a.connection_id === row.connection_id &&
          a.bank_account_id === row.bank_account_id,
      );
      let duplicate = false;
      if (mapping?.account_id && !row.removed) {
        const result = await db
          .from('transactions')
          .select('id')
          .eq('user_id', user.id)
          .eq('account_id', mapping.account_id)
          .eq('transaction_date', row.transaction_date)
          .eq('amount_cents', Math.abs(row.signed_cents))
          .eq('kind', row.signed_cents < 0 ? 'income' : 'expense');
        if (result.error)
          throw new Error('Unable to check bank transaction duplicates.');
        duplicate = result.data.some((r) => r.id !== row.transaction_id);
      }
      return { row, mapping, duplicate };
    }),
  );
  return (
    <>
      <header className="mb-4">
        <h1>Bank connections</h1>
        <p className="text-secondary">
          Connect, sync, and review your bank transactions.
        </p>
      </header>
      {!ready && (
        <div className="alert alert-info">
          Plaid setup is required before connecting a bank. Manual entry and CSV
          import remain available.
        </div>
      )}
      <section className="card mb-4">
        <div className="card-body">
          <h2 className="h5">Connect a bank</h2>
          <p>
            {process.env.PLAID_ENV === 'production'
              ? 'Real bank mode. Use only with your approved free Plaid Trial.'
              : 'Sandbox mode uses fictional banks and transactions.'}
          </p>
          <p className="small text-secondary">
            Bank login happens in Plaid Link. Your bank password is never sent
            to this app. Imported data persists until you delete it.
          </p>
          <BankLink disabled={!ready} />
        </div>
      </section>
      {!connections.data?.length && (
        <p>
          No banks connected yet. You can keep using{' '}
          <Link href="/import">CSV import</Link>.
        </p>
      )}
      {connections.data?.map((bank) => (
        <section className="card mb-3" key={bank.id}>
          <div className="card-body">
            <h2 className="h5">
              {bank.institution}{' '}
              <span className="badge text-bg-secondary">
                {bank.environment}
              </span>
            </h2>
            <p className="small text-secondary">
              {bank.disconnected
                ? 'Disconnected. Imported transactions are retained.'
                : bank.last_synced_at
                  ? `Last synced: ${new Date(bank.last_synced_at).toISOString().replace('T', ' ').slice(0, 16)} UTC`
                  : 'Not synced yet.'}
            </p>
            {mappings.data
              ?.filter((a) => a.connection_id === bank.id)
              .map((mapping) => (
                <div key={mapping.bank_account_id} className="mb-3">
                  <BankForm>
                    <input type="hidden" name="operation" value="map" />
                    <input type="hidden" name="connection" value={bank.id} />
                    <input
                      type="hidden"
                      name="bankAccount"
                      value={mapping.bank_account_id}
                    />
                    <label
                      className="form-label"
                      htmlFor={`map-${bank.id}-${mapping.bank_account_id}`}
                    >
                      {mapping.name}
                      {mapping.mask ? ` ••${mapping.mask}` : ''} → Tracker
                      account
                    </label>
                    <div className="d-flex flex-wrap gap-2">
                      <select
                        id={`map-${bank.id}-${mapping.bank_account_id}`}
                        className="form-select w-auto mw-100"
                        name="account"
                        required
                        defaultValue={mapping.account_id || ''}
                      >
                        <option value="">Choose an account</option>
                        {accounts.data?.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                      <button className="btn btn-outline-primary">
                        Save mapping
                      </button>
                    </div>
                  </BankForm>
                </div>
              ))}
            {!bank.disconnected && (
              <div className="d-flex flex-wrap align-items-start gap-3">
                <BankForm>
                  <input type="hidden" name="connection" value={bank.id} />
                  <button
                    className="btn btn-primary"
                    name="operation"
                    value="sync"
                    disabled={!ready}
                  >
                    Sync transactions
                  </button>
                </BankForm>
                <BankLink connection={bank.id} disabled={!ready} />
                <BankForm>
                  <input type="hidden" name="connection" value={bank.id} />
                  <label className="form-check-label d-block mb-2">
                    <input
                      type="checkbox"
                      className="form-check-input me-2"
                      name="confirm"
                      required
                    />
                    Confirm disconnect
                  </label>
                  <button
                    className="btn btn-outline-danger"
                    name="operation"
                    value="disconnect"
                    disabled={!ready}
                  >
                    Disconnect bank
                  </button>
                </BankForm>
              </div>
            )}
          </div>
        </section>
      ))}
      <section className="mt-4" aria-labelledby="review-title">
        <h2 className="h4" id="review-title">
          Review bank updates ({records.count || 0})
        </h2>
        <p className="small text-secondary">
          Only posted USD transactions can be imported. Pending transactions (
          {pending.count || 0}) stay out of totals. Choose a tracker account
          whose opening date precedes the imported history. For transfers
          between your own accounts, skip both bank entries and add one manual
          transfer.
        </p>
        <p className="small text-secondary">
          Bank corrections and removals require review. Applying a correction
          replaces that transaction’s amount, date, description, and category.
          Skipping keeps your existing ledger unchanged.
        </p>
        {!rows.length && (
          <div className="card">
            <div className="card-body">
              No posted bank updates to review. Sync a connected bank to check
              for new transactions.
            </div>
          </div>
        )}
        {reviewRows.map(({ row, mapping, duplicate }) => (
          <article
            className="card mb-3"
            key={`${row.connection_id}:${row.provider_id}`}
          >
            <div className="card-body">
              <h3 className="h6 text-break">{row.description}</h3>
              <p>
                {row.transaction_date} · {mapping?.name} ·{' '}
                {formatUsd(Math.abs(row.signed_cents))}{' '}
                {row.signed_cents < 0 ? 'income' : 'expense'}
              </p>
              {row.removed && (
                <p className="text-danger">
                  The bank removed this transaction. Confirm removal to delete
                  its imported ledger entry.
                </p>
              )}
              {row.transaction_id && !row.removed && (
                <p className="text-warning">
                  Correction to an imported transaction.
                </p>
              )}
              {!mapping?.account_id && !row.removed && (
                <p className="text-danger">
                  Save an account mapping above before importing.
                </p>
              )}
              {row.signed_cents === 0 && !row.removed && (
                <p>Zero amount: skip this entry.</p>
              )}
              {duplicate && (
                <p className="text-warning">
                  Possible duplicate of an existing transaction.
                </p>
              )}
              <BankForm>
                <input
                  type="hidden"
                  name="connection"
                  value={row.connection_id}
                />
                <input type="hidden" name="provider" value={row.provider_id} />
                <input type="hidden" name="version" value={row.version} />
                {!row.removed && (
                  <>
                    <label
                      className="form-label"
                      htmlFor={`category-${row.connection_id}-${row.provider_id}`}
                    >
                      Category
                    </label>
                    <select
                      className="form-select mb-2"
                      id={`category-${row.connection_id}-${row.provider_id}`}
                      name="category"
                      defaultValue=""
                    >
                      <option value="">Choose a category</option>
                      {categories.data
                        ?.filter(
                          (c) =>
                            c.kind ===
                            (row.signed_cents < 0 ? 'income' : 'expense'),
                        )
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </>
                )}
                {duplicate && (
                  <label className="d-block mb-2">
                    <input
                      type="checkbox"
                      className="form-check-input me-2"
                      name="allowDuplicate"
                    />
                    I checked: this is a separate transaction.
                  </label>
                )}
                <div className="d-flex gap-2 flex-wrap">
                  <button
                    name="operation"
                    value="review"
                    className={
                      row.removed ? 'btn btn-outline-danger' : 'btn btn-primary'
                    }
                    disabled={
                      !row.removed &&
                      (!mapping?.account_id || !row.signed_cents)
                    }
                  >
                    {row.removed
                      ? 'Confirm removal'
                      : row.transaction_id
                        ? 'Apply correction'
                        : 'Import transaction'}
                  </button>
                  <button
                    name="operation"
                    value="ignore"
                    className="btn btn-outline-secondary"
                  >
                    Skip update
                  </button>
                </div>
              </BankForm>
            </div>
          </article>
        ))}
        <nav className="d-flex gap-3 mt-3" aria-label="Bank review pages">
          {page > 1 && <Link href={`/banks?page=${page - 1}`}>Previous</Link>}
          {page * 25 < (records.count || 0) && (
            <Link href={`/banks?page=${page + 1}`}>Next</Link>
          )}
        </nav>
      </section>
    </>
  );
}
