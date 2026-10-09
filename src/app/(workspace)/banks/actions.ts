'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/supabase/user';
import { validId } from '@/lib/transactions';
import { plaidConfig, plaidRequest } from '@/lib/plaid/client';
import { decryptToken, encryptToken } from '@/lib/plaid/security';
import { collectSync, type SyncPage } from '@/lib/plaid/transactions';

export type BankState = { error?: string; message?: string };
const refresh = () => {
  for (const path of ['/banks', '/accounts', '/transactions', '/', '/budgets'])
    revalidatePath(path);
};
const fail = (error: unknown): BankState => ({
  error:
    error instanceof Error
      ? error.message
      : 'Unable to complete the bank request.',
});

type PlaidAccount = {
  account_id: string;
  name: string;
  mask: string | null;
  balances: { iso_currency_code: string | null };
};

async function connection(id: string) {
  const user = await requireUser();
  if (!validId(id)) throw new Error('Invalid bank connection.');
  const db = await createClient();
  const { data, error } = await db
    .from('plaid_connections')
    .select('*')
    .eq('user_id', user.id)
    .eq('id', id)
    .single();
  if (error || !data || data.disconnected || !data.encrypted_token)
    throw new Error('Bank connection is unavailable.');
  const config = plaidConfig();
  if (config.environment !== data.environment)
    throw new Error('This bank belongs to a different Plaid environment.');
  const token = decryptToken(
    data.encrypted_token,
    config.encryptionKey,
    `${user.id}:${id}`,
  );
  return { user, db, data, token };
}

async function saveBankAccounts(id: string, token: string) {
  const user = await requireUser();
  const db = await createClient();
  const data = await plaidRequest<{ accounts: PlaidAccount[] }>(
    '/accounts/get',
    { access_token: token },
  );
  for (const account of data.accounts) {
    const { error } = await db.from('plaid_accounts').upsert(
      {
        user_id: user.id,
        connection_id: id,
        bank_account_id: account.account_id,
        name: account.name.slice(0, 200),
        mask: account.mask,
      },
      { onConflict: 'connection_id,bank_account_id', ignoreDuplicates: true },
    );
    if (error)
      throw new Error(
        'Could not save bank accounts. Retry syncing this connection.',
      );
  }
}

export async function startBankLink(id?: string) {
  const user = await requireUser();
  try {
    const config = plaidConfig();
    const site = process.env.SITE_URL;
    if (!site) throw new Error('Configure SITE_URL before connecting a bank.');
    const existing = id ? await connection(id) : null;
    const data = await plaidRequest<{ link_token: string }>(
      '/link/token/create',
      {
        user: { client_user_id: user.id },
        client_name: 'Personal Finance Tracker',
        country_codes: ['US'],
        language: 'en',
        redirect_uri: new URL('/banks', site).toString(),
        ...(existing
          ? { access_token: existing.token }
          : {
              products: ['transactions'],
              transactions: { days_requested: 90 },
            }),
      },
    );
    return {
      token: data.link_token,
      id: id || randomUUID(),
      update: Boolean(existing),
      environment: config.environment,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function finishBankLink(
  id: string,
  publicToken: string,
  update = false,
): Promise<BankState> {
  const user = await requireUser();
  try {
    if (
      !validId(id) ||
      typeof publicToken !== 'string' ||
      publicToken.length > 500 ||
      (!update && !publicToken.startsWith('public-'))
    )
      throw new Error('Invalid bank link response.');
    if (update) {
      await connection(id);
      refresh();
      return {
        message: 'Bank access restored. Sync to check for new transactions.',
      };
    }
    const db = await createClient();
    const config = plaidConfig();
    const existing = await db
      .from('plaid_connections')
      .select('id,disconnected')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing.error)
      throw new Error('Unable to check this bank connection.');
    if (existing.data) {
      const saved = await connection(id);
      await saveBankAccounts(id, saved.token);
      refresh();
      return {
        message: 'Bank connected. Map its accounts and sync transactions.',
      };
    }
    const exchanged = await plaidRequest<{
      access_token: string;
      item_id: string;
    }>('/item/public_token/exchange', { public_token: publicToken });
    const { error } = await db.from('plaid_connections').insert({
      id,
      user_id: user.id,
      item_id: exchanged.item_id,
      environment: config.environment,
      encrypted_token: encryptToken(
        exchanged.access_token,
        config.encryptionKey,
        `${user.id}:${id}`,
      ),
      institution: 'Connected bank',
    });
    if (error) {
      // Do not leave a live Item behind when its token could not be persisted.
      try {
        await plaidRequest('/item/remove', {
          access_token: exchanged.access_token,
        });
      } catch {
        throw new Error(
          'Connection could not be saved or revoked. Remove this Item in the Plaid dashboard before trying again.',
        );
      }
      throw new Error('Could not save this bank connection. Start Link again.');
    }
    await saveBankAccounts(id, exchanged.access_token);
    refresh();
    return {
      message: 'Bank connected. Map its accounts and sync transactions.',
    };
  } catch (error) {
    refresh();
    return fail(error);
  }
}

export async function bankAction(
  _state: BankState,
  form: FormData,
): Promise<BankState> {
  await requireUser();
  try {
    const id = String(form.get('connection') || '');
    const operation = String(form.get('operation') || '');
    const user = await requireUser();
    const db = await createClient();
    if (operation === 'map') {
      const accountId = String(form.get('account') || '');
      const bankId = String(form.get('bankAccount') || '');
      if (!validId(id) || !validId(accountId) || !bankId || bankId.length > 200)
        throw new Error('Choose a tracker account.');
      const { error } = await db.rpc('map_plaid_account', {
        p_connection: id,
        p_bank_account: bankId,
        p_account: accountId,
      });
      if (error)
        throw new Error(
          'Unable to save this mapping. Choose an active account; mappings cannot change after import.',
        );
      refresh();
      return { message: 'Account mapping saved.' };
    }
    if (operation === 'review' || operation === 'ignore') {
      if (!validId(id)) throw new Error('Invalid bank connection.');
      const version = Number(form.get('version'));
      const provider = String(form.get('provider') || '');
      const category = String(form.get('category') || '');
      if (
        !Number.isSafeInteger(version) ||
        !provider ||
        provider.length > 200 ||
        (category && !validId(category))
      )
        throw new Error('Invalid transaction review.');
      const { error } = await db.rpc('review_plaid_record', {
        p_connection: id,
        p_provider: provider,
        p_version: version,
        p_category: category || null,
        p_ignore: operation === 'ignore',
        p_allow_duplicate: form.get('allowDuplicate') === 'on',
      });
      if (error)
        throw new Error(
          error.message.includes('duplicate')
            ? 'Possible duplicate. Check your existing transactions; only confirm if this is a separate transaction.'
            : 'Unable to save this review. Reload, check the account opening date and category, then try again.',
        );
      refresh();
      return {
        message:
          operation === 'ignore'
            ? 'Bank update skipped.'
            : 'Bank update applied to your transactions.',
      };
    }
    if (operation !== 'sync' && operation !== 'disconnect')
      throw new Error('Invalid bank action.');
    const saved = await connection(id);
    if (operation === 'disconnect') {
      if (form.get('confirm') !== 'on')
        throw new Error('Confirm disconnecting this bank.');
      await plaidRequest('/item/remove', { access_token: saved.token });
      const { error } = await db
        .from('plaid_connections')
        .update({ disconnected: true, encrypted_token: null })
        .eq('id', id)
        .eq('user_id', user.id);
      if (error)
        throw new Error(
          'Bank access was revoked. Retry to clear the saved connection.',
        );
      refresh();
      return {
        message: 'Bank disconnected. Imported transactions are retained.',
      };
    }
    await saveBankAccounts(id, saved.token);
    const updates = await collectSync(saved.data.cursor, (cursor) =>
      plaidRequest<SyncPage>('/transactions/sync', {
        access_token: saved.token,
        ...(cursor ? { cursor } : {}),
        count: 500,
      }),
    );
    const { error } = await db.rpc('stage_plaid_sync', {
      p_connection: id,
      p_previous: saved.data.cursor,
      p_cursor: updates.cursor,
      p_rows: updates.rows,
      p_removed: updates.removed,
    });
    if (error)
      throw new Error(
        'Sync could not be saved. Retry; your saved cursor has not advanced.',
      );
    refresh();
    return {
      message: `${updates.rows.length} bank updates fetched. Review posted transactions below. New connections may need another sync after bank data finishes preparing.`,
    };
  } catch (error) {
    return fail(error);
  }
}
