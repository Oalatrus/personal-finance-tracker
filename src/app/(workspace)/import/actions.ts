'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/supabase/user';
import { validId } from '@/lib/transactions';
import { prepareImport } from '@/lib/data/import';
import { MAX_IMPORT_ROWS, type ImportInput } from '@/lib/import/csv';

export async function reviewCsv(input: ImportInput) {
  await requireUser();
  try {
    if (!validId(input.account)) throw new Error('Choose an account.');
    return { rows: await prepareImport(input) };
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? e.message
          : 'Unable to review this CSV. Please try again.',
    };
  }
}

export async function importCsv(
  input: ImportInput,
  selected: number[],
  request: string,
  allowDuplicates: boolean,
) {
  await requireUser();
  try {
    if (
      !validId(input.account) ||
      !validId(request) ||
      !Array.isArray(selected) ||
      !selected.length ||
      selected.length > MAX_IMPORT_ROWS ||
      selected.some((n) => !Number.isInteger(n)) ||
      new Set(selected).size !== selected.length
    )
      throw new Error('Select valid rows and review again.');
    // Reparse the original CSV and validate ownership; never trust browser preview values.
    const review = await prepareImport(input);
    const rows = selected.map((n) => review.find((r) => r.row === n));
    if (rows.some((r) => !r || r.errors.length))
      throw new Error(
        'Some selected rows are invalid. Review again before importing.',
      );
    const payload = rows.map((r) => ({
      row: r!.row,
      kind: r!.kind,
      category_id: r!.category_id,
      amount_cents: r!.amount_cents,
      transaction_date: r!.transaction_date,
      description: r!.description,
    }));
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('import_csv_transactions', {
      p_account: input.account,
      p_request: request,
      p_rows: payload,
      p_allow_duplicates: allowDuplicates === true,
    });
    if (error)
      return {
        error: error.message.includes('duplicates')
          ? 'Possible duplicates were found. Review again, then explicitly confirm any duplicates you want to include.'
          : 'Unable to confirm this import. Check that the account and categories are still active, then retry. If the connection was interrupted, retrying is safe.',
      };
    revalidatePath('/transactions');
    revalidatePath('/');
    revalidatePath('/budgets');
    return { count: data };
  } catch (e) {
    return {
      error:
        e instanceof Error ? e.message : 'Unable to import. Please try again.',
    };
  }
}
