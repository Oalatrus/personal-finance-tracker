import { expect, test } from '@playwright/test';

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

test('private routes require sign-in; authentication validation and missing-page recovery work', async ({
  page,
}) => {
  for (const route of [
    '/',
    '/accounts',
    '/categories',
    '/transactions',
    '/budgets',
    '/import',
    '/banks',
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/auth\/login$/);
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
  }
  await page.goto('/auth/signup');
  await page.getByLabel('Email address').fill('invalid@example');
  expect(
    await page
      .getByLabel('Email address')
      .evaluate((el: HTMLInputElement) => el.checkValidity()),
  ).toBe(false);
  await page.getByLabel('New password', { exact: true }).fill('abcdefghij');
  expect(
    await page
      .getByLabel('New password', { exact: true })
      .evaluate((el: HTMLInputElement) => el.checkValidity()),
  ).toBe(false);
  await page.getByLabel('New password', { exact: true }).fill('abcdefghi!');
  expect(
    await page
      .getByLabel('New password', { exact: true })
      .evaluate((el: HTMLInputElement) => el.checkValidity()),
  ).toBe(true);
  await page.goto('/does-not-exist');
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Go to workspace' }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
});

test('accounts, categories, transactions, budgets and CSV import retain private data across sessions', async ({
  page,
  context,
}) => {
  test.skip(
    !email || !password,
    'Set disposable E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run the signed-in flow.',
  );
  expect(email).toMatch(/@example\.invalid$/);
  const tag = `Fictional ${Date.now()}`;
  const checking = `${tag} checking`,
    savings = `${tag} savings`;
  const meals = `${tag} meals`,
    salary = `${tag} salary`;
  const description = `${tag} lunch`;
  const login = async () => {
    await page.goto('/auth/login');
    await page.getByLabel('Email address').fill(email!);
    await page.getByLabel('Password', { exact: true }).fill(password!);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL('http://127.0.0.1:3100/');
  };
  const notice = (text: string) =>
    page.getByRole('status').filter({ hasText: text });
  const card = (name: string) =>
    page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await login();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await page.goto('/accounts');
  for (const [name, balance] of [
    [checking, '1000.00'],
    [savings, '0.00'],
  ]) {
    await page.getByLabel('Account name').fill(name!);
    await page.getByLabel('Opening balance (USD)').fill(balance!);
    await page.getByLabel('Opening date').fill('2026-10-01');
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click();
    await expect(notice('Account created.')).toBeVisible();
    await expect(page.getByLabel('Account name')).toHaveValue('');
  }
  await page.goto('/categories');
  for (const [name, kind] of [
    [meals, 'expense'],
    [salary, 'income'],
  ]) {
    await page.getByLabel('Category name').fill(name!);
    await page.getByLabel('Category type').selectOption(kind!);
    await page
      .getByRole('button', { name: 'Create category', exact: true })
      .click();
    await expect(notice('Category created.')).toBeVisible();
    await expect(card(name!)).toBeVisible();
    await expect(page.getByLabel('Category name')).toHaveValue('');
  }
  await page.getByLabel('Category name').fill(salary);
  await page.getByLabel('Category type').selectOption('income');
  await page
    .getByRole('button', { name: 'Create category', exact: true })
    .click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'already exists' }),
  ).toBeVisible();
  await expect(page.getByLabel('Category name')).toHaveValue(salary);
  await expect(page.getByLabel('Category type')).toHaveValue('income');
  await page.goto('/transactions');
  await page
    .getByLabel('Account', { exact: true })
    .selectOption({ label: checking });
  await page
    .getByLabel('Category', { exact: true })
    .selectOption({ label: meals });
  await page.getByLabel('Amount (USD)').fill('1.001');
  await page.getByLabel('Transaction date').fill('2026-10-02');
  await page.getByLabel('Description (optional)').fill(description);
  await page
    .getByRole('button', { name: 'Create transaction', exact: true })
    .click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'highlighted fields' }),
  ).toBeVisible();
  await expect(page.getByLabel('Amount (USD)')).toHaveValue('1.001');
  await expect(page.getByLabel('Description (optional)')).toHaveValue(
    description,
  );
  await expect(page.getByLabel('Account', { exact: true })).not.toHaveValue('');
  await page.getByLabel('Amount (USD)').fill('10.29');
  await page
    .getByRole('button', { name: 'Create transaction', exact: true })
    .click();
  await expect(notice('Transaction created.')).toBeVisible();
  await expect(page.getByLabel('Amount (USD)')).toHaveValue('');
  await page.getByLabel('Transaction type').selectOption('income');
  await page
    .getByLabel('Account', { exact: true })
    .selectOption({ label: checking });
  await page
    .getByLabel('Category', { exact: true })
    .selectOption({ label: salary });
  await page.getByLabel('Amount (USD)').fill('2500.00');
  await page.getByLabel('Transaction date').fill('2026-10-02');
  await page
    .getByRole('button', { name: 'Create transaction', exact: true })
    .click();
  await expect(notice('Transaction created.')).toBeVisible();
  await expect(page.getByLabel('Amount (USD)')).toHaveValue('');
  await page.getByLabel('Transaction type').selectOption('transfer');
  await page.getByLabel('From account').selectOption({ label: checking });
  await page.getByLabel('To account').selectOption({ label: savings });
  await page.getByLabel('Amount (USD)').fill('100.00');
  await page.getByLabel('Transaction date').fill('2026-10-02');
  await page
    .getByRole('button', { name: 'Create transaction', exact: true })
    .click();
  await expect(notice('Transaction created.')).toBeVisible();
  await expect(page.getByLabel('Amount (USD)')).toHaveValue('');
  await page.goto('/import');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Bank CSV file').setInputFiles({
    name: 'fictional.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      `Date,Description,Amount\n2026-10-02,${description},-10.29\n2026-10-03,${tag} CSV meal,-20.29\n2026-02-30,Invalid,-1.00`,
    ),
  });
  await page
    .getByLabel('Import into account')
    .selectOption({ label: checking });
  await page
    .getByLabel('Default expense category')
    .selectOption({ label: meals });
  await page.getByRole('button', { name: 'Review transactions' }).click();
  await expect(
    page.getByRole('heading', { name: '2. Review fictional.csv' }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Import row 1', { exact: true }),
  ).not.toBeChecked();
  await expect(page.getByLabel('Import row 2', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Import row 3', { exact: true })).toBeDisabled();
  await page
    .getByRole('button', { name: 'Import 1 selected transaction', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Import complete' }),
  ).toBeVisible();
  await page.goto('/budgets?month=2026-10');
  await page.getByLabel('Expense category').selectOption({ label: meals });
  await page.getByLabel('Monthly limit (USD)').fill('25.00');
  await page.getByRole('button', { name: 'Create budget' }).click();
  await expect(card(meals)).toContainText('$5.58 over budget');
  await expect(card(meals).getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '100',
  );
  await page.getByRole('link', { name: `Edit ${meals}`, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Edit budget', exact: true }),
  ).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Monthly limit (USD)').fill('50.00');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(card(meals)).toContainText('$19.42 remaining');
  await page.goto('/?from=2026-10-01&to=2026-10-31');
  await expect(
    page.getByRole('region', { name: 'Income', exact: true }),
  ).toContainText('$2,500.00');
  await expect(
    page.getByRole('region', { name: 'Expenses', exact: true }),
  ).toContainText('$30.58');
  await expect(page.locator('.balance-card')).toContainText('$3,469.42');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      '/?from=2026-10-01&to=2026-10-31',
      '/accounts',
      '/categories',
      '/transactions',
      '/budgets?month=2026-10',
      '/import',
      '/banks',
    ]) {
      await page.goto(route);
      await expect(page.locator('main h1')).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await page.evaluate(() =>
          [
            ...document.querySelectorAll<
              HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
            >('main input:not([type="hidden"]),main select,main textarea'),
          ].every((el) => el.labels?.length || el.getAttribute('aria-label')),
        ),
      ).toBe(true);
    }
  }
  await page.goto(`/transactions?q=${encodeURIComponent(description)}`);
  await expect(page.locator('article')).toHaveCount(1);
  await page.locator('article').getByRole('link', { name: /^Edit/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Edit transaction', exact: true }),
  ).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Amount (USD)').fill('12.34');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('article')).toContainText('$12.34');
  await page
    .locator('article')
    .getByText('Delete transaction', { exact: true })
    .click();
  await page
    .locator('article')
    .getByRole('button', { name: 'Confirm deletion' })
    .click();
  await expect(notice('Transaction deleted.')).toBeVisible();
  await expect(page.locator('article')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await page.goto('/accounts');
  await expect(page).toHaveURL(/\/auth\/login$/);
  await login();
  await page.goto('/accounts');
  await expect(card(checking)).toBeVisible();
  await context.clearCookies();
  await page.goto('/budgets');
  await expect(page).toHaveURL(/\/auth\/login$/);
});
