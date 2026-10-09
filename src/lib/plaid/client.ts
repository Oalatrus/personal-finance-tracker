import 'server-only';

export function plaidConfig() {
  const environment = process.env.PLAID_ENV || 'sandbox';
  if (environment !== 'sandbox' && environment !== 'production')
    throw new Error('Invalid Plaid environment.');
  if (
    environment === 'production' &&
    process.env.PLAID_FREE_TRIAL_APPROVED !== 'true'
  )
    throw new Error(
      'Real bank connections require confirmation of free Trial approval.',
    );
  const client = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const encryptionKey = process.env.PLAID_TOKEN_ENCRYPTION_KEY;
  if (
    !client ||
    !secret ||
    !encryptionKey ||
    !/^[a-f\d]{64}$/i.test(encryptionKey)
  )
    throw new Error('Plaid is not configured yet.');
  return { environment, client, secret, encryptionKey };
}

export function plaidReady() {
  try {
    plaidConfig();
    return true;
  } catch {
    return false;
  }
}

export async function plaidRequest<T>(
  path: string,
  values: Record<string, unknown>,
): Promise<T> {
  const config = plaidConfig();
  const response = await fetch(
    `https://${config.environment}.plaid.com${path}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Plaid-Version': '2020-09-14',
      },
      body: JSON.stringify({
        client_id: config.client,
        secret: config.secret,
        ...values,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    },
  );
  const data = await response.json();
  if (!response.ok) {
    if (
      path === '/item/remove' &&
      ['ITEM_NOT_FOUND', 'INVALID_ACCESS_TOKEN'].includes(data.error_code)
    )
      return {} as T;
    if (data.error_code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION')
      throw new Error(data.error_code);
    if (data.error_code === 'ITEM_LOGIN_REQUIRED')
      throw new Error('Reconnect this bank to restore access.');
    if (data.error_code === 'PRODUCT_NOT_READY')
      throw new Error(
        'Bank data is still preparing. Try syncing again shortly.',
      );
    // Provider messages may contain tokens or personal details; expose only safe errors.
    throw new Error(
      'Plaid could not complete the request. Try again or check your Plaid dashboard.',
    );
  }
  return data as T;
}
