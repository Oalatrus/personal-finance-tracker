import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseCsv,
  csvDate,
  csvMoney,
  normalizeImport,
  flagDuplicates,
  MAX_FILE_BYTES,
} from './csv.ts';
const accounts = [
  { id: 'account', archived: false, opening_date: '2026-01-01' },
];
const categories = [
  { id: 'expense', kind: 'expense', archived: false },
  { id: 'income', kind: 'income', archived: false },
];
const mapping = {
  date: 0,
  description: 1,
  amount: 2,
  debit: 2,
  credit: 3,
  mode: 'signed',
  positive: 'income',
  dateFormat: 'iso',
};
const input = (text, extra = {}) => ({
  text,
  account: 'account',
  mapping,
  expenseCategory: 'expense',
  incomeCategory: 'income',
  categories: {},
  ...extra,
});

test('CSV handles BOM, quoted separators, escaped quotes, multiline fields, and rejects malformed or oversized files', () => {
  const parsed = parseCsv(
    '\uFEFFDate,Description,Amount\r\n2026-10-01,"Cafe, \"\"fictional\"\"\nmeal",-10.29\r\n\r\n',
  );
  assert.equal(parsed.rows[0][1], 'Cafe, "fictional"\nmeal');
  assert.equal(
    parseCsv('Date;Memo;Amount\n2026-10-01;Lunch;-10.00').rows.length,
    1,
  );
  assert.throws(() => parseCsv('Date,Memo,Amount\n2026-10-01,"Unclosed,-1'));
  assert.throws(() => parseCsv('Date,Memo,Amount\n2026-10-01,-1'));
  assert.throws(() => parseCsv('x'.repeat(MAX_FILE_BYTES + 1)));
  assert.throws(() =>
    parseCsv(
      'Date,Memo,Amount\n' + Array(1001).fill('2026-10-01,Meal,-1').join('\n'),
    ),
  );
});

test('dates and money are explicit and exact; signed and split formats share transaction validation', () => {
  assert.equal(csvDate('02/03/2026', 'mdy'), '2026-02-03');
  assert.equal(csvDate('02/03/2026', 'dmy'), '2026-03-02');
  assert.equal(csvDate('2/29/2024', 'mdy'), '2024-02-29');
  assert.throws(() => csvDate('2/29/2026', 'mdy'));
  assert.throws(() => csvDate('10/5/26', 'mdy'));
  assert.equal(csvMoney('($1,234.29)'), -123429);
  assert.equal(csvMoney('+0.29'), 29);
  assert.throws(() => csvMoney('12,34.56'));
  assert.throws(() => csvMoney('1.001'));
  assert.throws(() => csvMoney('1e3'));
  const rows = normalizeImport(
    input('Date,Memo,Amount\n2026-10-01,Lunch,-0.29\n2026-10-02,Pay,1234.56'),
    accounts,
    categories,
  );
  assert.deepEqual(
    rows.map((r) => [r.kind, r.amount_cents, r.category_id, r.errors]),
    [
      ['expense', 29, 'expense', []],
      ['income', 123456, 'income', []],
    ],
  );
  const reversed = normalizeImport(
    input('Date,Memo,Amount\n2026-10-01,Lunch,0.29', {
      mapping: { ...mapping, positive: 'expense' },
    }),
    accounts,
    categories,
  );
  assert.equal(reversed[0].kind, 'expense');
  const split = normalizeImport(
    input(
      'Date,Memo,Debit,Credit\n2026-10-01,Meal,10.29,\n2026-10-02,Pay,,100.00\n2026-10-03,Both,1,2',
      { mapping: { ...mapping, mode: 'split' } },
    ),
    accounts,
    categories,
  );
  assert.deepEqual(
    split.slice(0, 2).map((r) => r.amount_cents),
    [1029, 10000],
  );
  assert.ok(split[2].errors.length);
  assert.throws(() =>
    normalizeImport(
      input('Date,Memo,Amount\n2026-10-01,Meal,1', {
        mapping: { ...mapping, description: 0 },
      }),
      accounts,
      categories,
    ),
  );
  const invalid = normalizeImport(
    input('Date,Memo,Amount\n2025-01-01,Earlier,-1\n2026-10-01,Zero,0'),
    accounts,
    categories,
  );
  assert.ok(invalid.every((r) => r.errors.length));
  assert.ok(
    normalizeImport(
      input('Date,Memo,Amount\n2026-10-01,Meal,-1'),
      [{ ...accounts[0], archived: true }],
      categories,
    )[0].errors.length,
  );
  assert.ok(
    normalizeImport(
      input('Date,Memo,Amount\n2026-10-01,Meal,-1', {
        categories: { 1: 'income' },
      }),
      accounts,
      categories,
    )[0].errors.length,
  );
});

test('duplicate review flags saved and repeated rows without hiding legitimate identical transactions', () => {
  const rows = normalizeImport(
    input(
      'Date,Memo,Amount\n2026-10-01,Lunch,-10\n2026-10-01,Lunch,-10\n2026-10-02,Pay,100\n2026-10-03,Pay,100',
    ),
    accounts,
    categories,
  );
  const flagged = flagDuplicates(rows, [
    { ...rows[2], category_id: 'different' },
  ]);
  assert.equal(flagged[0].duplicate, undefined);
  assert.equal(flagged[1].duplicate, 'Repeated in this CSV');
  assert.equal(flagged[2].duplicate, 'Matches an existing transaction');
  assert.equal(flagged[3].duplicate, undefined);
  assert.equal(flagged.length, 4);
});
