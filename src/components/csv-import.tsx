'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { importCsv, reviewCsv } from '@/app/(workspace)/import/actions';
import {
  MAX_FILE_BYTES,
  parseCsv,
  type ImportInput,
  type ImportRow,
  type Mapping,
} from '@/lib/import/csv';
import { formatUsd } from '@/lib/finance/money';
import type { Account } from '@/lib/accounts';
import type { Category } from '@/lib/categories';

const initialMapping: Mapping = {
  date: 0,
  description: 1,
  mode: 'signed',
  amount: 2,
  debit: 2,
  credit: 3,
  positive: 'income',
  dateFormat: 'iso',
};
const PAGE_SIZE = 50;
export function CsvImport({
  accounts,
  categories,
}: {
  accounts: Account[];
  categories: Category[];
}) {
  const [input, setInput] = useState<ImportInput>({
    text: '',
    account: '',
    mapping: initialMapping,
    expenseCategory: '',
    incomeCategory: '',
    categories: {},
  });
  const [header, setHeader] = useState<string[]>([]);
  const [filename, setFilename] = useState('');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [request, setRequest] = useState('');
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [pending, startTransition] = useTransition();
  const activeAccounts = accounts.filter((a) => !a.archived);
  const activeCategories = categories.filter((c) => !c.archived);
  const change = (values: Partial<ImportInput>) => {
    setInput((old) => ({ ...old, ...values }));
    setDirty(true);
    setRequest(crypto.randomUUID());
    setError('');
  };
  const mapping = (values: Partial<Mapping>) =>
    change({ mapping: { ...input.mapping, ...values } });
  const chosen = rows?.filter((r) => selected.includes(r.row)) ?? [];
  const hasDuplicates = chosen.some((r) => r.duplicate);
  const totals = chosen.reduce(
    (sum, r) => {
      sum[r.kind === 'income' ? 'income' : 'expense'] += BigInt(r.amount_cents);
      return sum;
    },
    { income: 0n, expense: 0n },
  );
  const displayTotal = (amount: bigint) => {
    const digits = (amount / 100n)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `$${digits}.${String(amount % 100n).padStart(2, '0')}`;
  };
  const review = () =>
    startTransition(async () => {
      setError('');
      try {
        const result = await reviewCsv(input);
        if (result.error) {
          setError(result.error);
          return;
        }
        const next = result.rows!;
        setSelected(
          next
            .filter((r) => !r.errors.length && !r.duplicate)
            .map((r) => r.row),
        );
        setRows(next);
        setDirty(false);
        setPage(0);
        setAllowDuplicates(false);
        if (!request) setRequest(crypto.randomUUID());
      } catch {
        setError('Unable to reach the server. Please try again.');
      }
    });
  if (count !== null)
    return (
      <section className="card card-body p-4">
        <h2 className="h4">Import complete</h2>
        <p role="status">
          Imported {count} transaction{count === 1 ? '' : 's'}.
        </p>
        <div className="d-flex flex-wrap gap-3">
          <Link href="/transactions" className="btn btn-primary">
            View transactions
          </Link>
          <button
            className="btn btn-outline-secondary"
            onClick={() => {
              setCount(null);
              setRows(null);
              setHeader([]);
              setInput({ ...input, text: '', categories: {} });
              setFilename('');
              setRequest('');
              setError('');
            }}
          >
            Import another CSV
          </button>
        </div>
      </section>
    );
  if (!activeAccounts.length)
    return (
      <section className="card card-body p-4">
        <h2 className="h5">Create an account first</h2>
        <p>Each bank export is imported into one active USD account.</p>
        <Link href="/accounts">Go to accounts</Link>
      </section>
    );
  const column = (
    key: 'date' | 'description' | 'amount' | 'debit' | 'credit',
    label: string,
  ) => (
    <div className="col-12 col-md-6" key={key}>
      <label className="form-label" htmlFor={`map-${key}`}>
        {label}
      </label>
      <select
        id={`map-${key}`}
        className="form-select"
        value={input.mapping[key]}
        onChange={(e) => mapping({ [key]: Number(e.target.value) })}
      >
        {header.map((name, i) => (
          <option key={i} value={i}>
            {i + 1}. {name || 'Unnamed column'}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <>
      <p className="text-secondary">
        Import one account at a time. Your CSV stays in memory and is not stored
        as a file. Nothing is saved until you confirm the review.
      </p>
      {!rows ? (
        <section className="card card-body p-4">
          <h2 className="h5">1. Upload and map columns</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              review();
            }}
          >
            <fieldset disabled={pending}>
              <div className="mb-3">
                <label htmlFor="csv-file" className="form-label">
                  Bank CSV file
                </label>
                <input
                  id="csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  className="form-control"
                  aria-describedby="csv-help"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    setHeader([]);
                    setRows(null);
                    setError('');
                    setInput((old) => ({ ...old, text: '', categories: {} }));
                    if (!file) return;
                    try {
                      if (file.size > MAX_FILE_BYTES)
                        throw new Error('Choose a CSV file up to 512 KB.');
                      const text = new TextDecoder('utf-8', {
                        fatal: true,
                      }).decode(await file.arrayBuffer());
                      const parsed = parseCsv(text);
                      setFilename(file.name);
                      setHeader(parsed.header);
                      setInput((old) => ({
                        ...old,
                        text,
                        mapping: initialMapping,
                        categories: {},
                      }));
                      setRequest(crypto.randomUUID());
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : 'Unable to read this CSV.',
                      );
                    }
                  }}
                />
                <div id="csv-help" className="form-text">
                  UTF-8 CSV with a header, up to 512 KB and 1,000 transactions.
                  Comma, semicolon, and tab delimiters are supported.
                </div>
              </div>
              <div className="mb-3">
                <label htmlFor="import-account" className="form-label">
                  Import into account
                </label>
                <select
                  id="import-account"
                  className="form-select"
                  required
                  value={input.account}
                  onChange={(e) => change({ account: e.target.value })}
                >
                  <option value="">Choose an account</option>
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              {!!header.length && (
                <>
                  <div className="row g-3 mb-3">
                    {column('date', 'Date column')}
                    {column('description', 'Description column')}
                    <div className="col-12 col-md-6">
                      <label htmlFor="date-format" className="form-label">
                        Date format
                      </label>
                      <select
                        id="date-format"
                        className="form-select"
                        value={input.mapping.dateFormat}
                        onChange={(e) =>
                          mapping({
                            dateFormat: e.target.value as Mapping['dateFormat'],
                          })
                        }
                      >
                        <option value="iso">YYYY-MM-DD</option>
                        <option value="mdy">MM/DD/YYYY</option>
                        <option value="dmy">DD/MM/YYYY</option>
                      </select>
                    </div>
                    <div className="col-12 col-md-6">
                      <label htmlFor="amount-format" className="form-label">
                        Amount columns
                      </label>
                      <select
                        id="amount-format"
                        className="form-select"
                        value={input.mapping.mode}
                        onChange={(e) =>
                          mapping({ mode: e.target.value as Mapping['mode'] })
                        }
                      >
                        <option value="signed">One signed amount column</option>
                        <option value="split">
                          Separate debit and credit columns
                        </option>
                      </select>
                    </div>
                    {input.mapping.mode === 'signed' ? (
                      <>
                        {column('amount', 'Amount column')}
                        <div className="col-12 col-md-6">
                          <label
                            htmlFor="positive-means"
                            className="form-label"
                          >
                            Positive amounts represent
                          </label>
                          <select
                            id="positive-means"
                            className="form-select"
                            value={input.mapping.positive}
                            onChange={(e) =>
                              mapping({
                                positive: e.target.value as Mapping['positive'],
                              })
                            }
                          >
                            <option value="income">
                              Income (negative amounts are expenses)
                            </option>
                            <option value="expense">
                              Expenses (negative amounts are income)
                            </option>
                          </select>
                        </div>
                      </>
                    ) : (
                      <>
                        {column('debit', 'Debit / expense column')}
                        {column('credit', 'Credit / income column')}
                      </>
                    )}
                    {(['expense', 'income'] as const).map((kind) => (
                      <div className="col-12 col-md-6" key={kind}>
                        <label
                          htmlFor={`default-${kind}`}
                          className="form-label"
                        >
                          Default {kind} category
                        </label>
                        <select
                          id={`default-${kind}`}
                          className="form-select"
                          value={
                            input[
                              kind === 'expense'
                                ? 'expenseCategory'
                                : 'incomeCategory'
                            ]
                          }
                          onChange={(e) =>
                            change({
                              [kind === 'expense'
                                ? 'expenseCategory'
                                : 'incomeCategory']: e.target.value,
                            })
                          }
                        >
                          <option value="">Choose during review</option>
                          {activeCategories
                            .filter((c) => c.kind === kind)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  <p className="small text-secondary">
                    Amounts must be in USD, with at most two decimal places.
                    Currency symbols, thousands separators, and negative amounts
                    in parentheses are accepted. Zero amounts are invalid.
                    Transfers need manual entry so both accounts stay correct.
                  </p>
                  <button className="btn btn-primary" disabled={pending}>
                    {pending ? 'Checking…' : 'Review transactions'}
                  </button>
                </>
              )}
            </fieldset>
          </form>
        </section>
      ) : (
        <section className="card card-body p-4" aria-busy={pending}>
          <h2 className="h5 text-break">2. Review {filename}</h2>
          <p>
            {rows.length} rows · {rows.filter((r) => r.errors.length).length}{' '}
            invalid · {rows.filter((r) => r.duplicate).length} possible
            duplicates.
          </p>
          <p className="small text-secondary">
            Possible duplicates match the account, date, type, amount, and exact
            description, or repeat within this file. They are unchecked by
            default. Category changes require an updated review. Scroll
            horizontally on smaller screens to see every column.
          </p>
          <div className="d-flex flex-wrap gap-2 mb-3">
            <button
              className="btn btn-outline-secondary"
              disabled={pending}
              onClick={() => {
                setRows(null);
                setError('');
              }}
            >
              Back to mapping
            </button>
            <button
              className="btn btn-outline-primary"
              disabled={pending}
              onClick={review}
            >
              {pending ? 'Checking…' : 'Update review'}
            </button>
            <button
              className="btn btn-outline-secondary"
              disabled={pending || dirty}
              onClick={() => {
                setSelected(
                  rows
                    .filter((r) => !r.errors.length && !r.duplicate)
                    .map((r) => r.row),
                );
                setRequest(crypto.randomUUID());
              }}
            >
              Select valid non-duplicates
            </button>
            <button
              className="btn btn-outline-secondary"
              disabled={pending}
              onClick={() => {
                setSelected([]);
                setRequest(crypto.randomUUID());
              }}
            >
              Clear selection
            </button>
          </div>
          {dirty && (
            <p role="status" className="alert alert-info">
              Categories changed. Update the review before importing.
            </p>
          )}
          <div
            className="table-responsive"
            tabIndex={0}
            role="region"
            aria-label="CSV transaction review, scroll horizontally to see all columns"
          >
            <table className="table align-middle">
              <caption className="visually-hidden">
                CSV transactions for review; row numbers exclude the header and
                blank rows.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Import</th>
                  <th scope="col">Row</th>
                  <th scope="col">Date</th>
                  <th scope="col">Description</th>
                  <th scope="col">Type / amount</th>
                  <th scope="col">Category</th>
                  <th scope="col">Validation</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                  .map((r) => (
                    <tr key={r.row}>
                      <td>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          aria-label={`Import row ${r.row}`}
                          checked={selected.includes(r.row)}
                          disabled={pending || dirty || !!r.errors.length}
                          onChange={(e) => {
                            setSelected(
                              e.target.checked
                                ? [...selected, r.row]
                                : selected.filter((n) => n !== r.row),
                            );
                            setRequest(crypto.randomUUID());
                            setAllowDuplicates(false);
                          }}
                        />
                      </td>
                      <th scope="row">{r.row}</th>
                      <td className="text-nowrap">{r.transaction_date}</td>
                      <td className="text-break">
                        {r.description || 'No description'}
                      </td>
                      <td className="text-nowrap">
                        {r.kind}
                        <br />
                        {formatUsd(r.amount_cents)}
                      </td>
                      <td>
                        <select
                          aria-label={`Category for row ${r.row}`}
                          className="form-select"
                          style={{ minWidth: 160 }}
                          disabled={pending}
                          value={
                            input.categories[String(r.row)] ??
                            r.category_id ??
                            ''
                          }
                          onChange={(e) =>
                            change({
                              categories: {
                                ...input.categories,
                                [String(r.row)]: e.target.value,
                              },
                            })
                          }
                        >
                          <option value="">Choose a category</option>
                          {activeCategories
                            .filter((c) => c.kind === r.kind)
                            .map((c) => (
                              <option value={c.id} key={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="small">
                        {r.errors.length ? (
                          <span className="text-danger">
                            {r.errors.join(' ')}
                          </span>
                        ) : r.duplicate ? (
                          <span className="text-warning-emphasis">
                            Possible duplicate: {r.duplicate}
                          </span>
                        ) : (
                          <span className="text-success">Ready</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {rows.length > PAGE_SIZE && (
            <nav
              aria-label="Review pages"
              className="d-flex gap-3 align-items-center my-3"
            >
              <button
                className="btn btn-outline-secondary btn-sm"
                disabled={!page || pending}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>
                Page {page + 1} of {Math.ceil(rows.length / PAGE_SIZE)}
              </span>
              <button
                className="btn btn-outline-secondary btn-sm"
                disabled={(page + 1) * PAGE_SIZE >= rows.length || pending}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </nav>
          )}
          <p role="status">
            {chosen.length} selected · Income {displayTotal(totals.income)} ·
            Expenses {displayTotal(totals.expense)}
          </p>
          {hasDuplicates && (
            <div className="form-check mb-3">
              <input
                id="allow-duplicates"
                type="checkbox"
                className="form-check-input"
                checked={allowDuplicates}
                disabled={pending}
                onChange={(e) => {
                  setAllowDuplicates(e.target.checked);
                  setRequest(crypto.randomUUID());
                }}
              />
              <label htmlFor="allow-duplicates" className="form-check-label">
                I reviewed and want to include the selected possible duplicates.
              </label>
            </div>
          )}
          <div>
            <button
              className="btn btn-primary"
              disabled={
                pending ||
                dirty ||
                !selected.length ||
                (hasDuplicates && !allowDuplicates)
              }
              onClick={() =>
                startTransition(async () => {
                  setError('');
                  try {
                    const result = await importCsv(
                      input,
                      selected,
                      request,
                      allowDuplicates,
                    );
                    if (result.error) setError(result.error);
                    else setCount(result.count!);
                  } catch {
                    setError(
                      'Connection interrupted. Retry this import safely, or check Transactions for the saved rows.',
                    );
                  }
                })
              }
            >
              {pending
                ? 'Importing…'
                : `Import ${selected.length} selected transaction${selected.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className="alert alert-danger mt-3">
          {error}
        </p>
      )}
      <p className="small mt-3">
        <Link href="/categories">Manage categories</Link> if you need another
        income or expense category.
      </p>
    </>
  );
}
