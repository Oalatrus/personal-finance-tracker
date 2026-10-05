'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/supabase/user';
import { saveCategory, removeCategory } from '@/lib/data/categories';
import {
  validateCategory,
  validCategoryId,
  type CategoryFields,
  type CategoryState,
} from '@/lib/categories';

export async function save(
  _previous: CategoryState,
  form: FormData,
): Promise<CategoryState> {
  await requireUser();
  const id = String(form.get('id') ?? '');
  if (id && !validCategoryId(id))
    return {
      error: 'This category is unavailable. Reload the page and try again.',
    };
  const fields: CategoryFields = {
    name: String(form.get('name') ?? ''),
    kind: String(form.get('kind') ?? ''),
    archived: form.get('archived') === 'on',
  };
  const { errors, values } = validateCategory(fields);
  if (Object.keys(errors).length)
    return { fields, errors, error: 'Check the highlighted fields.' };
  try {
    const { data, error } = await saveCategory(id, values);
    if (error)
      return {
        fields,
        error:
          error.code === '23505'
            ? 'A category with this name and type already exists, possibly archived. Choose another name or edit the existing category.'
            : error.code === '23503'
              ? 'This category is used by transactions or budgets, so its type cannot change. You can rename or archive it.'
              : 'Unable to save the category. Please try again.',
      };
    if (!data)
      return {
        fields,
        error: 'This category is unavailable. It may have been deleted.',
      };
  } catch {
    return { fields, error: 'Unable to reach the database. Please try again.' };
  }
  revalidatePath('/categories');
  revalidatePath('/');
  redirect(`/categories?notice=${id ? 'updated' : 'created'}`);
}

export async function remove(
  _previous: CategoryState,
  form: FormData,
): Promise<CategoryState> {
  await requireUser();
  const id = String(form.get('id') ?? '');
  if (!validCategoryId(id)) return { error: 'This category is unavailable.' };
  try {
    const { data, error } = await removeCategory(id);
    if (error)
      return {
        error:
          error.code === '23503'
            ? 'This category is used by transactions or budgets and cannot be deleted. Edit it and select Archived instead.'
            : 'Unable to delete the category. Please try again.',
      };
    if (!data)
      return {
        error:
          'This category is unavailable. It may already have been deleted.',
      };
  } catch {
    return { error: 'Unable to reach the database. Please try again.' };
  }
  revalidatePath('/categories');
  revalidatePath('/');
  redirect('/categories?notice=deleted');
}
