import type { Tables } from '@/lib/supabase/database.types';
import type { Account } from '@/lib/accounts';
import type { Category } from '@/lib/categories';
import { parseUsd } from './finance/money.ts';

export type Transaction = Tables<'transactions'>;
export const transactionKinds = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
};
export type TransactionFields = {
  kind: string;
  account: string;
  destination: string;
  category: string;
  amount: string;
  date: string;
  description: string;
};
export type TransactionState = {
  error?: string;
  errors?: Partial<Record<keyof TransactionFields, string>>;
};
export const validId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000'))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function validateTransaction(
  fields: TransactionFields,
  accounts: Account[],
  categories: Category[],
  existing?: Transaction | null,
) {
  const errors: NonNullable<TransactionState['errors']> = {};
  if (!Object.hasOwn(transactionKinds, fields.kind))
    errors.kind = 'Choose a transaction type.';
  let amount = 0;
  try {
    amount = parseUsd(fields.amount);
    if (amount <= 0) throw new Error();
  } catch {
    errors.amount =
      'Enter a positive USD amount, up to 90,000,000,000.00, with at most two decimal places. No commas or dollar sign.';
  }
  if (!validDate(fields.date)) errors.date = 'Choose a valid transaction date.';
  const description = fields.description.trim();
  if ([...description].length > 500)
    errors.description = 'Use no more than 500 characters.';
  const account = accounts.find((a) => a.id === fields.account);
  const destination = accounts.find((a) => a.id === fields.destination);
  // An archived reference may stay on its existing transaction, but cannot be newly assigned.
  if (!account || (account.archived && account.id !== existing?.account_id))
    errors.account = 'Choose an active account.';
  if (account && fields.date < account.opening_date)
    errors.date = `Choose a date on or after the account’s opening date (${account.opening_date}).`;
  if (fields.kind === 'transfer') {
    if (
      !destination ||
      (destination.archived &&
        destination.id !== existing?.destination_account_id)
    )
      errors.destination = 'Choose an active destination account.';
    else if (destination.id === fields.account)
      errors.destination = 'Choose a different destination account.';
    if (destination && fields.date < destination.opening_date)
      errors.date = `Choose a date on or after the destination’s opening date (${destination.opening_date}).`;
  } else {
    const category = categories.find((c) => c.id === fields.category);
    if (
      !category ||
      category.kind !== fields.kind ||
      (category.archived && category.id !== existing?.category_id)
    )
      errors.category =
        'Choose an active category matching the transaction type.';
  }
  return {
    errors,
    values: {
      kind: fields.kind,
      account_id: fields.account,
      destination_account_id:
        fields.kind === 'transfer' ? fields.destination : null,
      category_id: fields.kind === 'transfer' ? null : fields.category,
      amount_cents: amount,
      transaction_date: fields.date,
      description,
    },
  };
}

export const PAGE_SIZE = 20;
export const sortOptions = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  largest: 'Largest amount',
  smallest: 'Smallest amount',
};
export type TransactionFilters = {
  q: string;
  kind: string;
  account: string;
  category: string;
  from: string;
  to: string;
  sort: string;
  page: number;
};
export type SearchParams = Record<string, string | string[] | undefined>;
export function readFilters(query: SearchParams) {
  const value = (key: string) =>
    typeof query[key] === 'string' ? (query[key] as string) : '';
  const filters: TransactionFilters = {
    q: value('q').trim(),
    kind: value('kind'),
    account: value('account'),
    category: value('category'),
    from: value('from'),
    to: value('to'),
    sort: value('sort') || 'newest',
    page: Number(value('page') || 1),
  };
  const invalid =
    filters.q.length > 200 ||
    (filters.kind && !Object.hasOwn(transactionKinds, filters.kind)) ||
    (filters.account && !validId(filters.account)) ||
    (filters.category && !validId(filters.category)) ||
    (filters.from && !validDate(filters.from)) ||
    (filters.to && !validDate(filters.to)) ||
    (filters.from && filters.to && filters.from > filters.to) ||
    !Object.hasOwn(sortOptions, filters.sort) ||
    !Number.isSafeInteger(filters.page) ||
    filters.page < 1 ||
    filters.page > 1000000;
  return {
    filters,
    error: invalid
      ? 'Check the filters: use valid dates, an end date on or after the start date, and a valid page number.'
      : undefined,
  };
}
export function transactionUrl(
  filters: TransactionFilters,
  extra: Record<string, string> = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...extra }))
    if (String(value)) params.set(key, String(value));
  return `/transactions?${params}`;
}
