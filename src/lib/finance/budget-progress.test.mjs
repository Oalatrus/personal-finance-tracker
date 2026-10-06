import assert from 'node:assert/strict';
import test from 'node:test';
import {
  budgetMonthRange,
  calculateBudgetProgress,
} from './budget-progress.ts';
const budget = (id, amount) => ({
  id,
  category_id: id,
  month: '2026-10-01',
  amount_cents: amount,
});
const expense = (id, category, amount, options = {}) => ({
  id,
  category_id: category,
  kind: 'expense',
  amount_cents: amount,
  transaction_date: '2026-10-15',
  ...options,
});

test('zero, exact-limit, and over-budget states retain cents and cap only the bar', () => {
  const result = calculateBudgetProgress(
    [budget('empty', 100), budget('at', 100), budget('over', 100)],
    [expense('a', 'at', 29), expense('b', 'at', 71), expense('c', 'over', 150)],
    '2026-10',
  );
  assert.deepEqual(
    result.map((p) => [
      p.status,
      p.spentCents,
      p.remainingCents,
      p.percentUsed,
      p.progressPercent,
    ]),
    [
      ['under', 0, 100, '0', 0],
      ['at', 100, 0, '100', 100],
      ['over', 150, -50, '150', 100],
    ],
  );
});

test('monthly spending includes both boundaries and excludes income, transfers, and other months', () => {
  const rows = [
    expense('first', 'groceries', 29, { transaction_date: '2026-10-01' }),
    expense('last', 'groceries', 71, { transaction_date: '2026-10-31' }),
    expense('prior', 'groceries', 500, { transaction_date: '2026-09-30' }),
    expense('future', 'groceries', 500, { transaction_date: '2026-11-01' }),
    expense('income', 'groceries', 1000, { kind: 'income' }),
    expense('transfer', null, 1000, { kind: 'transfer' }),
    expense('other', 'unbudgeted', 500),
  ];
  const result = calculateBudgetProgress(
    [budget('groceries', 300)],
    rows,
    '2026-10',
  )[0];
  assert.equal(result.spentCents, 100);
  assert.equal(result.remainingCents, 200);
  assert.equal(result.percentUsed, '33.3');
  assert.deepEqual(budgetMonthRange('2024-02'), {
    from: '2024-02-01',
    to: '2024-02-29',
  });
  assert.equal(budgetMonthRange('2026-02').to, '2026-02-28');
  assert.equal(budgetMonthRange('9999-12').to, '9999-12-31');
  for (const month of ['0000-01', '2026-13', '2026-1'])
    assert.throws(() => budgetMonthRange(month));
});

test('large overages stay exact and unsafe or duplicate inputs fail', () => {
  const result = calculateBudgetProgress(
    [budget('tiny', 1)],
    [expense('large', 'tiny', Number.MAX_SAFE_INTEGER)],
    '2026-10',
  )[0];
  assert.equal(result.percentUsed, '900719925474099100');
  assert.equal(result.progressPercent, 100);
  const row = expense('duplicate', 'tiny', 1);
  assert.throws(
    () => calculateBudgetProgress([budget('tiny', 1)], [row, row], '2026-10'),
    /Duplicate/,
  );
  assert.throws(
    () => calculateBudgetProgress([budget('tiny', 0)], [], '2026-10'),
    /positive/,
  );
  assert.throws(
    () =>
      calculateBudgetProgress(
        [budget('tiny', 1)],
        [
          expense('a', 'tiny', Number.MAX_SAFE_INTEGER),
          expense('b', 'tiny', 1),
        ],
        '2026-10',
      ),
    /supported range/,
  );
  assert.throws(
    () =>
      calculateBudgetProgress(
        [budget('tiny', 1)],
        [expense('a', 'tiny', 1.5)],
        '2026-10',
      ),
    /integer cents/,
  );
});
