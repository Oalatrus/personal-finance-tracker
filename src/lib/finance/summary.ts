export type FinanceAccount = {
  id: string;
  opening_balance_cents: number;
  opening_date: string;
};
export type FinanceTransaction = {
  id: string;
  account_id: string;
  destination_account_id: string | null;
  category_id: string | null;
  kind: string;
  amount_cents: number;
  transaction_date: string;
};
export type DateRange = { from: string; to: string };

function checkDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith('0000') ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new Error('Use a valid date in YYYY-MM-DD format.');
}

function cents(value: number): bigint {
  if (!Number.isSafeInteger(value))
    throw new Error('Money must be safe integer cents.');
  return BigInt(value);
}

function resultCents(value: bigint): number {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error('The calculated amount exceeds the supported range.');
  }
  return Number(value);
}

// Supply all accounts (including archived) and their complete transaction history through `to`.
export function calculateSummary(
  accounts: readonly FinanceAccount[],
  transactions: readonly FinanceTransaction[],
  range: DateRange,
) {
  checkDate(range.from);
  checkDate(range.to);
  if (range.from > range.to)
    throw new Error('The start date must not follow the end date.');
  const accountById = new Map<string, FinanceAccount>();
  const balances = new Map<string, bigint>();
  for (const account of accounts) {
    if (!account.id || accountById.has(account.id))
      throw new Error('Account IDs must be unique.');
    checkDate(account.opening_date);
    const opening = cents(account.opening_balance_cents);
    accountById.set(account.id, account);
    if (account.opening_date <= range.to) balances.set(account.id, opening);
  }
  let income = 0n;
  let expenses = 0n;
  const spending = new Map<string, bigint>();
  const seen = new Set<string>();
  for (const transaction of transactions) {
    if (!transaction.id || seen.has(transaction.id))
      throw new Error('Transaction IDs must be unique.');
    seen.add(transaction.id);
    checkDate(transaction.transaction_date);
    const amount = cents(transaction.amount_cents);
    if (amount <= 0n) throw new Error('Transaction amounts must be positive.');
    const account = accountById.get(transaction.account_id);
    if (!account)
      throw new Error('A transaction references a missing account.');
    if (transaction.transaction_date < account.opening_date)
      throw new Error('A transaction precedes its account’s opening date.');
    if (transaction.kind === 'transfer') {
      const destination = accountById.get(
        transaction.destination_account_id ?? '',
      );
      if (
        !destination ||
        destination.id === account.id ||
        transaction.category_id !== null
      )
        throw new Error('Invalid transfer accounts or category.');
      if (transaction.transaction_date < destination.opening_date)
        throw new Error('A transfer precedes its destination’s opening date.');
    } else if (
      !['income', 'expense'].includes(transaction.kind) ||
      !transaction.category_id ||
      transaction.destination_account_id !== null
    )
      throw new Error('Invalid transaction type or category.');
    if (transaction.transaction_date > range.to) continue;
    const balance = balances.get(account.id)!;
    balances.set(
      account.id,
      balance + (transaction.kind === 'income' ? amount : -amount),
    );
    if (transaction.kind === 'transfer') {
      const destinationId = transaction.destination_account_id!;
      balances.set(destinationId, balances.get(destinationId)! + amount);
      continue;
    }
    // Earlier transactions affect the balance, but not this period’s cash flow.
    if (transaction.transaction_date < range.from) continue;
    if (transaction.kind === 'income') income += amount;
    else {
      expenses += amount;
      const categoryId = transaction.category_id!;
      spending.set(categoryId, (spending.get(categoryId) ?? 0n) + amount);
    }
  }
  let total = 0n;
  const accountBalances = [...balances].map(([accountId, balance]) => {
    total += balance;
    return { accountId, balanceCents: resultCents(balance) };
  });
  return {
    balanceCents: resultCents(total),
    incomeCents: resultCents(income),
    expenseCents: resultCents(expenses),
    netIncomeCents: resultCents(income - expenses),
    accountBalances,
    spendingByCategory: [...spending]
      .map(([categoryId, amount]) => ({
        categoryId,
        amountCents: resultCents(amount),
      }))
      .sort(
        (a, b) =>
          b.amountCents - a.amountCents ||
          a.categoryId.localeCompare(b.categoryId),
      ),
  };
}

export type TrendPoint = {
  from: string;
  to: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
};

export function calculateTrends(
  accounts: readonly FinanceAccount[],
  transactions: readonly FinanceTransaction[],
  range: DateRange,
) {
  calculateSummary(accounts, transactions, range);
  const days =
    (new Date(`${range.to}T00:00:00Z`).getTime() -
      new Date(`${range.from}T00:00:00Z`).getTime()) /
      86400000 +
    1;
  const months =
    (Number(range.to.slice(0, 4)) - Number(range.from.slice(0, 4))) * 12 +
    Number(range.to.slice(5, 7)) -
    Number(range.from.slice(5, 7)) +
    1;
  const interval = days <= 62 ? 'day' : months <= 24 ? 'month' : 'year';
  const events = accounts.map((a) => ({
    date: a.opening_date,
    delta: cents(a.opening_balance_cents),
    income: 0n,
    expense: 0n,
  }));
  for (const t of transactions) {
    if (t.kind === 'transfer') continue;
    const amount = cents(t.amount_cents);
    events.push({
      date: t.transaction_date,
      delta: t.kind === 'income' ? amount : -amount,
      income: t.kind === 'income' ? amount : 0n,
      expense: t.kind === 'expense' ? amount : 0n,
    });
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  let index = 0;
  let balance = 0n;
  const points: TrendPoint[] = [];
  let start = range.from;
  while (start <= range.to) {
    const next = new Date(`${start}T00:00:00Z`);
    if (interval === 'day') next.setUTCDate(next.getUTCDate() + 1);
    else if (interval === 'month') {
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + 1);
    } else {
      next.setUTCMonth(0, 1);
      next.setUTCFullYear(next.getUTCFullYear() + 1);
    }
    const endDate = new Date(next.getTime() - 86400000);
    const end =
      endDate.toISOString().slice(0, 10) > range.to
        ? range.to
        : endDate.toISOString().slice(0, 10);
    let income = 0n;
    let expense = 0n;
    while (index < events.length && events[index]!.date <= end) {
      const event = events[index++]!;
      balance += event.delta;
      // History before the first bucket carries the balance forward without entering its cash flow.
      if (event.date >= start) {
        income += event.income;
        expense += event.expense;
      }
    }
    points.push({
      from: start,
      to: end,
      incomeCents: resultCents(income),
      expenseCents: resultCents(expense),
      balanceCents: resultCents(balance),
    });
    if (end === range.to) break;
    start = next.toISOString().slice(0, 10);
  }
  return { interval, points };
}
