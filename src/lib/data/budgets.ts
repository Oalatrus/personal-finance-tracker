import 'server-only';
import { allRows } from '@/lib/data/rows';
import {
  budgetMonthRange,
  calculateBudgetProgress,
} from '@/lib/finance/budget-progress';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/supabase/user';
import {
  validateBudget,
  type BudgetFields,
  type BudgetState,
} from '@/lib/budgets';

export async function listBudgets(month: string) {
  const user = await requireUser();
  const supabase = await createClient();
  try {
    const { from, to } = budgetMonthRange(month);
    const [budgets, expenses] = await Promise.all([
      allRows((after) => {
        let query = supabase
          .from('budgets')
          .select('*')
          .eq('user_id', user.id)
          .eq('month', from)
          .order('id')
          .limit(500);
        if (after) query = query.gt('id', after);
        return query;
      }),
      allRows((after) => {
        let query = supabase
          .from('transactions')
          .select('id,category_id,kind,amount_cents,transaction_date')
          .eq('user_id', user.id)
          .eq('kind', 'expense')
          .gte('transaction_date', from)
          .lte('transaction_date', to)
          .order('id')
          .limit(500);
        if (after) query = query.gt('id', after);
        return query;
      }),
    ]);
    const progress = calculateBudgetProgress(budgets, expenses, month);
    return {
      data: budgets.map((budget, index) => ({
        ...budget,
        progress: progress[index]!,
      })),
      error: null,
    };
  } catch {
    return {
      data: null,
      error: 'Unable to load budget spending. Please try again.',
    };
  }
}
export async function saveBudget(
  id: string,
  fields: BudgetFields,
): Promise<BudgetState> {
  const user = await requireUser();
  const supabase = await createClient();
  const { errors, values } = validateBudget(fields);
  if (Object.keys(errors).length)
    return { fields, errors, error: 'Check the highlighted fields.' };
  const [category, previous] = await Promise.all([
    supabase
      .from('categories')
      .select('id,kind,archived')
      .eq('user_id', user.id)
      .eq('id', fields.category)
      .maybeSingle(),
    id
      ? supabase
          .from('budgets')
          .select('*')
          .eq('user_id', user.id)
          .eq('id', id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (category.error || previous.error)
    return {
      fields,
      error: 'Unable to load budget details. Please try again.',
    };
  if (id && !previous.data)
    return {
      fields,
      error: 'This budget is unavailable. It may have been deleted.',
    };
  if (
    !category.data ||
    category.data.kind !== 'expense' ||
    (category.data.archived &&
      (previous.data?.category_id !== category.data.id ||
        previous.data?.month !== values.month))
  )
    return {
      fields,
      errors: {
        category:
          'Choose an active expense category. An existing archived category can stay on its original month.',
      },
      error: 'Check the highlighted fields.',
    };
  const result = id
    ? await supabase
        .from('budgets')
        .update(values)
        .eq('user_id', user.id)
        .eq('id', id)
        .select('id')
        .maybeSingle()
    : await supabase
        .from('budgets')
        .insert({ ...values, user_id: user.id, category_kind: 'expense' })
        .select('id')
        .single();
  if (result.error)
    return {
      fields,
      error:
        result.error.code === '23505'
          ? 'A budget already exists for this category and month. Edit that budget instead.'
          : 'Unable to save the budget. Please try again.',
    };
  if (!result.data)
    return {
      fields,
      error: 'This budget is unavailable. It may have been deleted.',
    };
  return {};
}
