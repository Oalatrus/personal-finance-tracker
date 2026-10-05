import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/supabase/user';
import { calculateSummary, type DateRange } from '@/lib/finance/summary';

async function allRows<T extends { id: string }>(
  page: (after: string) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  let after = '';
  // Continue until empty, even if the server's row limit is smaller than our batch size.
  for (;;) {
    const { data, error } = await page(after);
    if (error || !data) throw new Error('Unable to load dashboard records.');
    if (!data.length) return rows;
    rows.push(...data);
    after = data[data.length - 1]!.id;
  }
}

export async function getDashboard(range: DateRange) {
  const user = await requireUser();
  const supabase = await createClient();
  const [accounts, categories, transactions] = await Promise.all([
    allRows((after) => {
      let query = supabase
        .from('accounts')
        .select('id,name,archived,opening_date,opening_balance_cents')
        .eq('user_id', user.id)
        .order('id')
        .limit(500);
      if (after) query = query.gt('id', after);
      return query;
    }),
    allRows((after) => {
      let query = supabase
        .from('categories')
        .select('id,name,archived')
        .eq('user_id', user.id)
        .order('id')
        .limit(500);
      if (after) query = query.gt('id', after);
      return query;
    }),
    allRows((after) => {
      let query = supabase
        .from('transactions')
        .select(
          'id,account_id,destination_account_id,category_id,kind,amount_cents,transaction_date',
        )
        .eq('user_id', user.id)
        .lte('transaction_date', range.to)
        .order('id')
        .limit(500);
      if (after) query = query.gt('id', after);
      return query;
    }),
  ]);
  const summary = calculateSummary(accounts, transactions, range);
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  return {
    ...summary,
    hasAccounts: accounts.length > 0,
    accounts: summary.accountBalances.map((a) => ({
      ...a,
      name: accountById.get(a.accountId)!.name,
      archived: accountById.get(a.accountId)!.archived,
    })),
    spending: summary.spendingByCategory.map((c) => {
      const category = categoryById.get(c.categoryId);
      if (!category) throw new Error('A spending category is unavailable.');
      return { ...c, name: category.name, archived: category.archived };
    }),
  };
}
