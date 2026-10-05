import type { Tables } from '@/lib/supabase/database.types';
import { parseUsd } from '@/lib/finance/money';
export type Budget = Tables<'budgets'>;
export type BudgetFields = { category: string; month: string; amount: string };
export type BudgetState = {
  error?: string;
  fields?: BudgetFields;
  errors?: Partial<Record<keyof BudgetFields, string>>;
};
export const validMonth = (month: string) =>
  /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month);
export function validateBudget(fields: BudgetFields) {
  const errors: NonNullable<BudgetState['errors']> = {};
  if (!validMonth(fields.month)) errors.month = 'Choose a valid month.';
  let amount = 0;
  try {
    amount = parseUsd(fields.amount);
    if (amount <= 0) throw new Error();
  } catch {
    errors.amount =
      'Enter a positive USD amount with up to two decimal places, no commas or dollar sign, and a maximum of 90,000,000,000.00.';
  }
  return {
    errors,
    values: {
      category_id: fields.category,
      month: `${fields.month}-01`,
      amount_cents: amount,
    },
  };
}
