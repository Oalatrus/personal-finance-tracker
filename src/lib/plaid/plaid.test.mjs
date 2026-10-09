import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { verifyPlaidWebhook } from './webhook.ts';
import { encryptToken, decryptToken } from './security.ts';
import { normalizeBankTransaction, collectSync } from './transactions.ts';

const transaction = {
  transaction_id: 'fictional-tx',
  account_id: 'fictional-account',
  amount: 10.29,
  iso_currency_code: 'USD',
  date: '2026-10-01',
  name: 'Fictional groceries',
  pending: false,
};
const empty = {
  added: [],
  modified: [],
  removed: [],
  next_cursor: 'cursor-done',
  has_more: false,
};

test('bank dollars preserve exact cents, debit/credit direction, and reject unsupported data', () => {
  assert.equal(normalizeBankTransaction(transaction).signed_cents, 1029);
  assert.equal(
    normalizeBankTransaction({ ...transaction, amount: -0.29 }).signed_cents,
    -29,
  );
  assert.throws(() =>
    normalizeBankTransaction({ ...transaction, amount: 10.291 }),
  );
  assert.throws(() =>
    normalizeBankTransaction({ ...transaction, iso_currency_code: 'EUR' }),
  );
  assert.throws(() =>
    normalizeBankTransaction({ ...transaction, date: '2026-02-30' }),
  );
});

test('tokens encrypt with fresh IVs and reject tampering, wrong keys, or another owner', () => {
  const key = 'ab'.repeat(32);
  const encrypted = encryptToken(
    'fictional-access-token',
    key,
    'owner:connection',
  );
  assert.equal(
    decryptToken(encrypted, key, 'owner:connection'),
    'fictional-access-token',
  );
  assert.notEqual(
    encrypted,
    encryptToken('fictional-access-token', key, 'owner:connection'),
  );
  assert.ok(!encrypted.includes('fictional-access-token'));
  assert.throws(() => decryptToken(encrypted, key, 'other-owner:connection'));
  assert.throws(() =>
    decryptToken(encrypted, 'cd'.repeat(32), 'owner:connection'),
  );
  assert.throws(() =>
    decryptToken(encrypted.slice(0, -3) + 'aaa', key, 'owner:connection'),
  );
});

test('paginated sync merges corrections and removals before returning a cursor', async () => {
  const cursors = [];
  const result = await collectSync('start', async (cursor) => {
    cursors.push(cursor);
    return cursor === 'start'
      ? { ...empty, added: [transaction], next_cursor: 'page2', has_more: true }
      : {
          ...empty,
          modified: [{ ...transaction, amount: 12.19 }],
          added: [{ ...transaction, transaction_id: 'removed' }],
          removed: [{ transaction_id: 'removed' }],
        };
  });
  assert.deepEqual(cursors, ['start', 'page2']);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].signed_cents, 1219);
  assert.deepEqual(result.removed, ['removed']);
  assert.equal(result.cursor, 'cursor-done');
});

test('pagination mutation restarts from the original cursor and discards incomplete changes', async () => {
  let calls = 0;
  const cursors = [];
  const result = await collectSync('original', async (cursor) => {
    cursors.push(cursor);
    calls++;
    if (calls === 1)
      return {
        ...empty,
        added: [transaction],
        has_more: true,
        next_cursor: 'partial',
      };
    if (calls === 2)
      throw new Error('TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION');
    return {
      ...empty,
      added: [{ ...transaction, transaction_id: 'correct-retry' }],
    };
  });
  assert.deepEqual(cursors, ['original', 'partial', 'original']);
  assert.deepEqual(
    result.rows.map((r) => r.provider_id),
    ['correct-retry'],
  );
});

test('a failed or oversized sync never returns a partially advanced cursor', async () => {
  await assert.rejects(
    collectSync('start', async () => {
      throw new Error('Network failure');
    }),
    /Network failure/,
  );
  let count = 0;
  await assert.rejects(
    collectSync(null, async () => ({
      ...empty,
      has_more: true,
      next_cursor: String(++count),
    })),
    /Too many bank updates/,
  );
});

test('bank categories suggest familiar labels while transfers and loan movements need attention', () => {
  const classify = (amount, primary, detailed, transaction_code) =>
    normalizeBankTransaction({
      ...transaction,
      amount,
      transaction_code,
      personal_finance_category: primary ? { primary, detailed } : null,
    });
  assert.equal(
    classify(10.29, 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES')
      .auto_category_name,
    'Groceries',
  );
  assert.equal(
    classify(-2500, 'INCOME', 'INCOME_WAGES').auto_category_name,
    'Salary',
  );
  assert.equal(
    classify(-10.29, 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_OTHER')
      .auto_category_name,
    'Refunds',
  );
  assert.equal(classify(10.29, null).auto_category_name, 'Uncategorized');
  for (const primary of [
    'TRANSFER_IN',
    'TRANSFER_OUT',
    'LOAN_PAYMENTS',
    'LOAN_DISBURSEMENTS',
  ])
    assert.equal(classify(10.29, primary, '').transfer_review, true);
  assert.equal(classify(10.29, null, '', 'transfer').transfer_review, true);
  assert.equal(classify(10.29, 'FOOD_AND_DRINK', '').transfer_review, false);
});

test('webhooks require a fresh ES256 signature and the original body hash; tampering and expired keys fail', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const key = {
    ...(await exportJWK(publicKey)),
    kid: 'fictional-key',
    alg: 'ES256',
    expired_at: null,
  };
  const body = JSON.stringify({
    webhook_type: 'TRANSACTIONS',
    item_id: 'fictional-item',
  });
  const hash = createHash('sha256').update(body).digest('hex');
  const sign = (age = 0, claimedHash = hash) =>
    new SignJWT({ request_body_sha256: claimedHash })
      .setProtectedHeader({ alg: 'ES256', kid: key.kid })
      .setIssuedAt(Math.floor(Date.now() / 1000) - age)
      .sign(privateKey);
  const signature = await sign();
  const fetchKey = async (id) => {
    assert.equal(id, key.kid);
    return key;
  };
  await verifyPlaidWebhook(body, signature, fetchKey);
  await assert.rejects(verifyPlaidWebhook(body + ' ', signature, fetchKey));
  await assert.rejects(verifyPlaidWebhook(body, null, fetchKey));
  await assert.rejects(verifyPlaidWebhook(body, await sign(301), fetchKey));
  await assert.rejects(verifyPlaidWebhook(body, await sign(-60), fetchKey));
  await assert.rejects(
    verifyPlaidWebhook(body, await sign(0, 'not-a-hash'), fetchKey),
  );
  await assert.rejects(
    verifyPlaidWebhook(body, signature, async () => ({
      ...key,
      expired_at: 1,
    })),
  );
  const other = await generateKeyPair('ES256');
  await assert.rejects(
    verifyPlaidWebhook(body, signature, async () => ({
      ...(await exportJWK(other.publicKey)),
      kid: key.kid,
      alg: 'ES256',
    })),
  );
  const hsToken = await new SignJWT({ request_body_sha256: hash })
    .setProtectedHeader({ alg: 'HS256', kid: key.kid })
    .setIssuedAt()
    .sign(new Uint8Array(32));
  await assert.rejects(verifyPlaidWebhook(body, hsToken, fetchKey));
});
