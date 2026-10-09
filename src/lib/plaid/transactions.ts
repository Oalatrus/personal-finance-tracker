import { parseUsd } from '../finance/money.ts';

export type BankTransaction = {
  transaction_id: string;
  account_id: string;
  amount: number;
  iso_currency_code: string | null;
  date: string;
  name: string;
  merchant_name?: string | null;
  pending: boolean;
  transaction_code?: string | null;
  personal_finance_category?: {
    primary: string;
    detailed: string;
    confidence_level?: string;
  } | null;
};
export type SyncPage = {
  added: BankTransaction[];
  modified: BankTransaction[];
  removed: { transaction_id: string }[];
  next_cursor: string;
  has_more: boolean;
};

const categoryNames: Record<string, string> = {
  INCOME: 'Income',
  BANK_FEES: 'Bank fees',
  ENTERTAINMENT: 'Entertainment',
  FOOD_AND_DRINK: 'Food & drink',
  GENERAL_MERCHANDISE: 'Shopping',
  GENERAL_SERVICES: 'Services',
  GOVERNMENT_AND_NON_PROFIT: 'Government & donations',
  HOME_IMPROVEMENT: 'Home improvement',
  MEDICAL: 'Medical',
  PERSONAL_CARE: 'Personal care',
  RENT_AND_UTILITIES: 'Rent & utilities',
  TRANSPORTATION: 'Transportation',
  TRAVEL: 'Travel',
};

export function bankClassification(row: BankTransaction) {
  const primary = row.personal_finance_category?.primary || '';
  const detailed = row.personal_finance_category?.detailed || '';
  const transfer =
    [
      'TRANSFER_IN',
      'TRANSFER_OUT',
      'LOAN_DISBURSEMENTS',
      'LOAN_PAYMENTS',
    ].includes(primary) || row.transaction_code === 'transfer';
  let name = categoryNames[primary] || 'Uncategorized';
  if (detailed === 'FOOD_AND_DRINK_GROCERIES') name = 'Groceries';
  if (detailed === 'INCOME_WAGES') name = 'Salary';
  if (row.amount < 0 && primary && primary !== 'INCOME' && !transfer)
    name = 'Refunds';
  return { auto_category_name: name, transfer_review: transfer };
}

export function normalizeBankTransaction(row: BankTransaction) {
  if (row.iso_currency_code !== 'USD')
    throw new Error('Only USD transactions are supported.');
  if (!Number.isFinite(row.amount)) throw new Error('Invalid bank amount.');
  const amount = parseUsd(String(row.amount));
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
    new Date(`${row.date}T00:00:00Z`).toISOString().slice(0, 10) !== row.date
  )
    throw new Error('Invalid bank date.');
  if (!row.transaction_id || !row.account_id)
    throw new Error('Invalid bank transaction.');
  // Plaid positive amounts are debits; negative amounts are credits.
  return {
    provider_id: row.transaction_id,
    bank_account_id: row.account_id,
    signed_cents: amount,
    transaction_date: row.date,
    description: (row.merchant_name || row.name || 'Bank transaction').slice(
      0,
      500,
    ),
    pending: row.pending,
    ...bankClassification(row),
  };
}

export async function collectSync(
  start: string | null,
  fetchPage: (cursor: string | null) => Promise<SyncPage>,
) {
  const started = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    let cursor = start;
    const changes = new Map<
      string,
      ReturnType<typeof normalizeBankTransaction>
    >();
    const removed = new Set<string>();
    try {
      for (let page = 0; page < 20; page++) {
        if (Date.now() - started > 40_000)
          throw new Error(
            'Bank sync took too long. Retry; incomplete updates were not saved.',
          );
        const result = await fetchPage(cursor);
        for (const row of [...result.added, ...result.modified]) {
          changes.set(row.transaction_id, normalizeBankTransaction(row));
          removed.delete(row.transaction_id);
        }
        for (const row of result.removed) {
          changes.delete(row.transaction_id);
          removed.add(row.transaction_id);
        }
        if (!result.has_more)
          return {
            rows: [...changes.values()],
            removed: [...removed],
            cursor: result.next_cursor,
          };
        if (result.next_cursor === cursor)
          throw new Error('Bank sync did not advance.');
        cursor = result.next_cursor;
      }
      throw new Error('Too many bank updates. Try a smaller history window.');
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' ||
        attempt === 2
      )
        throw error;
      // Restart the whole page sequence; never save an incomplete cursor.
    }
  }
  throw new Error('Unable to complete bank sync.');
}
