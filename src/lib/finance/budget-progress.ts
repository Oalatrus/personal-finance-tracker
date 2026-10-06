export const validMonth = (month: string) =>
  /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month);

export function budgetMonthRange(month: string) {
  if (!validMonth(month)) throw new Error('Choose a valid budget month.');
  const from = `${month}-01`;
  const end = new Date(`${from}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return { from, to: end.toISOString().slice(0, 10) };
}

type BudgetAmount = {
  id: string;
  category_id: string;
  month: string;
  amount_cents: number;
};
type Expense = {
  id: string;
  category_id: string | null;
  kind: string;
  amount_cents: number;
  transaction_date: string;
};

function positiveCents(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error('Amounts must be positive, safe integer cents.');
  return BigInt(value);
}

export function calculateBudgetProgress(
  budgets: readonly BudgetAmount[],
  transactions: readonly Expense[],
  month: string,
) {
  const { from, to } = budgetMonthRange(month);
  const spending = new Map<string, bigint>();
  const seen = new Set<string>();
  for (const transaction of transactions) {
    if (
      transaction.kind !== 'expense' ||
      transaction.transaction_date < from ||
      transaction.transaction_date > to
    )
      continue;
    if (seen.has(transaction.id)) throw new Error('Duplicate expense records.');
    seen.add(transaction.id);
    if (!transaction.category_id)
      throw new Error('An expense is missing its category.');
    const amount = positiveCents(transaction.amount_cents);
    spending.set(
      transaction.category_id,
      (spending.get(transaction.category_id) ?? 0n) + amount,
    );
  }
  return budgets.map((budget) => {
    if (budget.month !== from)
      throw new Error('A budget belongs to a different month.');
    const limit = positiveCents(budget.amount_cents);
    const spent = spending.get(budget.category_id) ?? 0n;
    if (spent > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error('Budget spending exceeds the supported range.');
    // Round percentages with integers; even extreme overages retain their exact cents.
    const tenths = (spent * 1000n + limit / 2n) / limit;
    const percentUsed = `${tenths / 10n}${tenths % 10n ? `.${tenths % 10n}` : ''}`;
    return {
      budgetId: budget.id,
      spentCents: Number(spent),
      remainingCents: Number(limit - spent),
      percentUsed,
      progressPercent: Number(tenths > 1000n ? 1000n : tenths) / 10,
      status: spent > limit ? 'over' : spent === limit ? 'at' : 'under',
    };
  });
}
