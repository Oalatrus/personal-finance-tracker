'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/supabase/user';
import { validId } from '@/lib/transactions';
import type { Json } from '@/lib/supabase/database.types';
import { plaidConfig, plaidRequest } from '@/lib/plaid/client';
import { decryptToken, encryptToken } from '@/lib/plaid/security';
import {
  saveBankAccounts as syncAccounts,
  syncBank,
  webhookUrl,
} from '@/lib/plaid/sync';
import { plaidReady } from '@/lib/plaid/client';

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

function importMessage(result: Json) {
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new Error('Unable to read the bank sync result.');
  const count = (name: string) =>
    typeof result[name] === 'number' ? result[name] : 0;
  return `${count('imported')} imported, ${count('updated')} updated, ${count('removed')} removed. ${count('review')} need review; ${count('pending')} pending.`;
}

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
  const saved = await connection(id);
  await syncAccounts(saved.db, saved.data, token);
}

async function initialSync(id: string) {
  const saved = await connection(id);
  try {
    await syncBank(saved.db, saved.data);
  } catch {
    // The connection is saved; automatic checks retry while the bank prepares its history.
  }
}

export async function automaticBankUpdates() {
  const user = await requireUser();
  if (!plaidReady()) return { checked: 0, version: '', error: false };
  const db = await createClient();
  const config = plaidConfig();
  const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const url = webhookUrl();
  const dueFilter =
    `last_checked_at.is.null,last_checked_at.lt.${cutoff}` +
    (url ? `,webhook_url.is.null,webhook_url.neq.${url}` : '');
  const due = await db
    .from('plaid_connections')
    .select('*')
    .eq('user_id', user.id)
    .eq('disconnected', false)
    .eq('environment', config.environment)
    .or(dueFilter)
    .order('last_checked_at', { nullsFirst: true })
    .limit(5);
  if (due.error) return { checked: 0, version: '', error: true };
  const results = await Promise.allSettled(
    due.data.map((bank) =>
      syncBank(db, bank, {
        automatic: !(url && bank.webhook_url !== url),
      }),
    ),
  );
  const checked = results.filter(
    (r) => r.status === 'fulfilled' && !r.value.busy,
  ).length;
  const latest = await db
    .from('plaid_connections')
    .select('last_synced_at,sync_error')
    .eq('user_id', user.id)
    .eq('disconnected', false)
    .order('id');
  return {
    checked,
    version:
      latest.data?.map((bank) => bank.last_synced_at || '').join('|') || '',
    error: Boolean(
      latest.error ||
      latest.data?.some((bank) => bank.sync_error) ||
      results.some((r) => r.status === 'rejected'),
    ),
  };
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
        ...(webhookUrl() ? { webhook: webhookUrl() } : {}),
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
      await initialSync(id);
      refresh();
      return {
        message: 'Bank access restored. Transactions update automatically.',
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
      await initialSync(id);
      refresh();
      return {
        message:
          'Bank connected. Map its accounts once; transactions update automatically.',
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
    await initialSync(id);
    refresh();
    return {
      message:
        'Bank connected. Map its accounts once; transactions update automatically.',
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
    if (operation === 'settings') {
      if (!validId(id)) throw new Error('Invalid bank connection.');
      const enabled = form.get('automatic') === 'on';
      const { data, error } = await db
        .from('plaid_connections')
        .update({
          auto_import: enabled,
          ...(enabled ? { last_checked_at: null } : {}),
        })
        .eq('id', id)
        .eq('user_id', user.id)
        .select('id')
        .maybeSingle();
      if (error || !data) throw new Error('Unable to save import settings.');
      refresh();
      return {
        message: enabled
          ? 'Automatic import enabled. Posted transactions will import automatically.'
          : 'Manual review enabled.',
      };
    }
    if (operation === 'import-ready') {
      if (!validId(id)) throw new Error('Invalid bank connection.');
      const { data, error } = await db.rpc('import_ready_plaid_transactions', {
        p_connection: id,
      });
      if (error)
        throw new Error(
          'Unable to import ready transactions. Your ledger was not changed; try again.',
        );
      refresh();
      return { message: importMessage(data) };
    }
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
      const settings = await db
        .from('plaid_connections')
        .select('auto_import')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();
      if (!settings.error && settings.data.auto_import) {
        const imported = await db.rpc('import_ready_plaid_transactions', {
          p_connection: id,
        });
        refresh();
        return {
          message: imported.error
            ? 'Account mapping saved. Transactions will import on the next automatic update.'
            : `Account mapping saved. ${importMessage(imported.data)}`,
        };
      }
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
    const result = await syncBank(db, saved.data);
    refresh();
    return {
      message: result.busy
        ? 'Bank updates are already running. Transactions will appear automatically.'
        : importMessage(result.result),
    };
  } catch (error) {
    return fail(error);
  }
}
