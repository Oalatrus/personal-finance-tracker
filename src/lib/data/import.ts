import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/supabase/user';
import { allRows } from './rows';
import {
  flagDuplicates,
  normalizeImport,
  type ImportInput,
} from '@/lib/import/csv';

export async function prepareImport(input: ImportInput) {
  const user = await requireUser();
  const supabase = await createClient();
  const [accounts, categories] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', user.id),
    supabase.from('categories').select('*').eq('user_id', user.id),
  ]);
  if (accounts.error || categories.error)
    throw new Error(
      'Unable to load accounts and categories. Please try again.',
    );
  const rows = normalizeImport(
    input,
    accounts.data ?? [],
    categories.data ?? [],
  );
  const dates = rows
    .filter((r) => !r.errors.length)
    .map((r) => r.transaction_date)
    .sort();
  const existing = dates.length
    ? await allRows((after) => {
        let query = supabase
          .from('transactions')
          .select('id,kind,amount_cents,transaction_date,description')
          .eq('user_id', user.id)
          .eq('account_id', input.account)
          .gte('transaction_date', dates[0]!)
          .lte('transaction_date', dates[dates.length - 1]!)
          .order('id')
          .limit(500);
        if (after) query = query.gt('id', after);
        return query;
      })
    : [];
  return flagDuplicates(rows, existing);
}
