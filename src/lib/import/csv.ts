import Papa from 'papaparse';
import { parseUsd, usdInput } from '../finance/money.ts';
import { validDate, validateTransaction } from '../transactions.ts';
import type { Account } from '../accounts';
import type { Category } from '../categories';

export const MAX_FILE_BYTES = 512 * 1024;
export const MAX_IMPORT_ROWS = 1000;
export type Mapping = {
  date: number;
  description: number;
  mode: 'signed' | 'split';
  amount: number;
  debit: number;
  credit: number;
  positive: 'income' | 'expense';
  dateFormat: 'iso' | 'mdy' | 'dmy';
};
export type ImportInput = {
  text: string;
  account: string;
  mapping: Mapping;
  expenseCategory: string;
  incomeCategory: string;
  categories: Record<string, string>;
};
export type ImportRow = {
  row: number;
  kind: string;
  account_id: string;
  destination_account_id: string | null;
  category_id: string | null;
  amount_cents: number;
  transaction_date: string;
  description: string;
  errors: string[];
  duplicate?: string;
};
export type DuplicateRecord = Pick<
  ImportRow,
  'kind' | 'amount_cents' | 'transaction_date' | 'description'
>;

export function parseCsv(text: string) {
  if (!text || new TextEncoder().encode(text).length > MAX_FILE_BYTES)
    throw new Error('Choose a UTF-8 CSV file up to 512 KB.');
  if (text.includes('\0') || text.includes('\uFFFD'))
    throw new Error('The file contains invalid text. Export it as UTF-8 CSV.');
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
  });
  const error = result.errors.find((e) => e.code !== 'UndetectableDelimiter');
  if (error) throw new Error(`Invalid CSV: ${error.message}`);
  const [header, ...rows] = result.data;
  if (!header || header.length < 3 || header.length > 50)
    throw new Error('Use a CSV with a header and between 3 and 50 columns.');
  if (!rows.length || rows.length > MAX_IMPORT_ROWS)
    throw new Error('Use a CSV with between 1 and 1,000 transaction rows.');
  if (rows.some((row) => row.length !== header.length))
    throw new Error(
      'Every row must have the same number of columns as the header.',
    );
  if (
    header.some((cell) => cell.length > 200) ||
    rows.some((r) => r.some((c) => c.length > 2000))
  )
    throw new Error('The CSV contains a field that is too long.');
  return { header: header.map((h) => h.trim()), rows };
}

export function csvDate(value: string, format: Mapping['dateFormat']) {
  let date = value.trim();
  if (format !== 'iso') {
    const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(date);
    if (!match) throw new Error('Use a date matching the selected format.');
    const month = format === 'mdy' ? match[1]! : match[2]!;
    const day = format === 'mdy' ? match[2]! : match[1]!;
    date = `${match[3]}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  if (!validDate(date))
    throw new Error('Use a valid date matching the selected format.');
  return date;
}

export function csvMoney(value: string) {
  let input = value.trim();
  const parentheses = /^\(.*\)$/.test(input);
  if (parentheses) input = `-${input.slice(1, -1).trim()}`;
  input = input.replace(/^(-?)\$\s*/, '$1').replace(/^\+/, '');
  if (input.includes(',')) {
    if (!/^-?\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(input))
      throw new Error('Use USD amounts with valid thousands separators.');
    input = input.replaceAll(',', '');
  }
  return parseUsd(input);
}

export function normalizeImport(
  input: ImportInput,
  accounts: Account[],
  categories: Category[],
) {
  const { header, rows } = parseCsv(input.text);
  const m = input.mapping;
  if (
    !m ||
    !['signed', 'split'].includes(m.mode) ||
    !['income', 'expense'].includes(m.positive) ||
    !['iso', 'mdy', 'dmy'].includes(m.dateFormat)
  )
    throw new Error('Choose valid amount and date formats.');
  const columns = [
    m.date,
    m.description,
    ...(m.mode === 'signed' ? [m.amount] : [m.debit, m.credit]),
  ];
  if (
    columns.some((c) => !Number.isInteger(c) || c < 0 || c >= header.length) ||
    new Set(columns).size !== columns.length
  )
    throw new Error('Map each required field to a different CSV column.');
  return rows.map((cells, index): ImportRow => {
    const errors: string[] = [];
    let amount = 0;
    let kind = 'expense';
    let date = cells[m.date]!.trim();
    try {
      date = csvDate(date, m.dateFormat);
    } catch (e) {
      errors.push((e as Error).message);
    }
    try {
      if (m.mode === 'signed') {
        const signed = csvMoney(cells[m.amount]!);
        kind =
          signed > 0
            ? m.positive
            : m.positive === 'income'
              ? 'expense'
              : 'income';
        amount = Math.abs(signed);
      } else {
        const debit = cells[m.debit]!.trim() ? csvMoney(cells[m.debit]!) : 0;
        const credit = cells[m.credit]!.trim() ? csvMoney(cells[m.credit]!) : 0;
        if (debit < 0 || credit < 0 || (debit > 0 && credit > 0))
          throw new Error('Use a positive debit or credit, not both.');
        kind = credit > 0 ? 'income' : 'expense';
        amount = debit || credit;
      }
    } catch (e) {
      errors.push((e as Error).message);
    }
    const row = index + 1;
    const category =
      input.categories[String(row)] ??
      (kind === 'income' ? input.incomeCategory : input.expenseCategory);
    const checked = validateTransaction(
      {
        kind,
        account: input.account,
        destination: '',
        category,
        amount: usdInput(amount),
        date,
        description: cells[m.description]!,
      },
      accounts,
      categories,
    );
    errors.push(...Object.values(checked.errors));
    return { row, ...checked.values, errors: [...new Set(errors)] };
  });
}

// Category changes do not hide a bank transaction match; identical real transactions remain selectable.
export function duplicateKey(row: DuplicateRecord) {
  return JSON.stringify([
    row.transaction_date,
    row.kind,
    row.amount_cents,
    row.description.trim(),
  ]);
}
export function flagDuplicates(rows: ImportRow[], existing: DuplicateRecord[]) {
  const saved = new Set(existing.map(duplicateKey));
  const seen = new Set<string>();
  return rows.map((row) => {
    const key = duplicateKey(row);
    const duplicate = !row.errors.length
      ? saved.has(key)
        ? 'Matches an existing transaction'
        : seen.has(key)
          ? 'Repeated in this CSV'
          : undefined
      : undefined;
    if (!row.errors.length) seen.add(key);
    return { ...row, duplicate };
  });
}
