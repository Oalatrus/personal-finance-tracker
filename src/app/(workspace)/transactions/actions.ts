'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/supabase/user';
import { saveTransaction, removeTransaction } from '@/lib/data/transactions';
import {
  validId,
  readFilters,
  transactionUrl,
  type TransactionFields,
  type TransactionState,
} from '@/lib/transactions';

function returnUrl(form: FormData, notice: string) {
  const params = new URLSearchParams(String(form.get('filters') ?? ''));
  const { filters, error } = readFilters(Object.fromEntries(params));
  return error
    ? `/transactions?notice=${notice}`
    : transactionUrl(filters, { notice });
}

export async function save(
  _previous: TransactionState,
  form: FormData,
): Promise<TransactionState> {
  await requireUser();
  const id = String(form.get('id') ?? '');
  if (id && !validId(id)) return { error: 'This transaction is unavailable.' };
  const fields = Object.fromEntries(
    [
      'kind',
      'account',
      'destination',
      'category',
      'amount',
      'date',
      'description',
    ].map((key) => [key, String(form.get(key) ?? '')]),
  ) as TransactionFields;
  try {
    const result = await saveTransaction(id, fields);
    if (result.error) return result;
  } catch {
    return { error: 'Unable to reach the database. Please try again.' };
  }
  revalidatePath('/transactions');
  revalidatePath('/budgets');
  revalidatePath('/');
  redirect(returnUrl(form, id ? 'updated' : 'created'));
}

export async function remove(
  _previous: TransactionState,
  form: FormData,
): Promise<TransactionState> {
  await requireUser();
  const id = String(form.get('id') ?? '');
  if (!validId(id)) return { error: 'This transaction is unavailable.' };
  try {
    const result = await removeTransaction(id);
    if (result.error) return result;
  } catch {
    return { error: 'Unable to reach the database. Please try again.' };
  }
  revalidatePath('/transactions');
  revalidatePath('/budgets');
  revalidatePath('/');
  redirect(returnUrl(form, 'deleted'));
}
