'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/supabase/user';
import { saveAccount, removeAccount } from '@/lib/data/accounts';
import {
  validateAccount,
  validAccountId,
  type AccountFields,
  type AccountState,
} from '@/lib/accounts';

export async function save(
  _previous: AccountState,
  form: FormData,
): Promise<AccountState> {
  await requireUser();
  const id = String(form.get('id') ?? '');
  if (id && !validAccountId(id))
    return {
      error: 'This account is unavailable. Reload the page and try again.',
    };
  const fields: AccountFields = {
    name: String(form.get('name') ?? ''),
    type: String(form.get('type') ?? ''),
    balance: String(form.get('balance') ?? ''),
    date: String(form.get('date') ?? ''),
    archived: form.get('archived') === 'on',
  };
  const { errors, values } = validateAccount(fields);
  if (Object.keys(errors).length)
    return { fields, errors, error: 'Check the highlighted fields.' };
  try {
    const { data, error } = await saveAccount(id, values);
    if (error)
      return {
        fields,
        error:
          error.code === 'OPENING_DATE'
            ? error.message
            : 'Unable to save the account. Please try again.',
      };
    if (!data)
      return {
        fields,
        error: 'This account is unavailable. It may have been deleted.',
      };
  } catch {
    return { fields, error: 'Unable to reach the database. Please try again.' };
  }
  revalidatePath('/accounts');
  revalidatePath('/');
  redirect(`/accounts?notice=${id ? 'updated' : 'created'}`);
}

export async function remove(
  _previous: AccountState,
  form: FormData,
): Promise<AccountState> {
  await requireUser();
  const id = String(form.get('id') ?? '');
  if (!validAccountId(id)) return { error: 'This account is unavailable.' };
  try {
    const { data, error } = await removeAccount(id);
    if (error)
      return {
        error:
          error.code === '23503'
            ? 'This account has financial history and cannot be deleted. Edit it and select Archived instead.'
            : 'Unable to delete the account. Please try again.',
      };
    if (!data)
      return {
        error: 'This account is unavailable. It may already have been deleted.',
      };
  } catch {
    return { error: 'Unable to reach the database. Please try again.' };
  }
  revalidatePath('/accounts');
  revalidatePath('/');
  redirect('/accounts?notice=deleted');
}
