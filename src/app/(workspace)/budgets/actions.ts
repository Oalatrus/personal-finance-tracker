'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/supabase/user';
import { validId } from '@/lib/transactions';
import { saveBudget } from '@/lib/data/budgets';
import type { BudgetFields, BudgetState } from '@/lib/budgets';

export async function save(
  _previous: BudgetState,
  form: FormData,
): Promise<BudgetState> {
  await requireUser();
  const id = String(form.get('id') ?? '');
  const fields: BudgetFields = {
    category: String(form.get('category') ?? ''),
    month: String(form.get('month') ?? ''),
    amount: String(form.get('amount') ?? ''),
  };
  if (id && !validId(id))
    return { fields, error: 'This budget is unavailable.' };
  if (!validId(fields.category))
    return {
      fields,
      errors: { category: 'Choose an expense category.' },
      error: 'Check the highlighted fields.',
    };
  try {
    const result = await saveBudget(id, fields);
    if (result.error) return result;
  } catch {
    return { fields, error: 'Unable to reach the database. Please try again.' };
  }
  revalidatePath('/budgets');
  redirect(
    `/budgets?month=${fields.month}&notice=${id ? 'updated' : 'created'}`,
  );
}
