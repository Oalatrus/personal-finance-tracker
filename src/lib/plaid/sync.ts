import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { plaidConfig, plaidRequest } from './client';
import { decryptToken } from './security';
import { collectSync, type SyncPage } from './transactions';

export type BankConnection =
  Database['public']['Tables']['plaid_connections']['Row'];
type Client = SupabaseClient<Database>;
type PlaidAccount = { account_id: string; name: string; mask: string | null };

export function webhookUrl() {
  if (!process.env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_')) return null;
  const site = process.env.SITE_URL;
  if (!site) return null;
  const url = new URL('/api/plaid/webhook', site);
  if (
    url.protocol !== 'https:' ||
    ['localhost', '127.0.0.1'].includes(url.hostname)
  )
    return null;
  return url.toString();
}

export async function saveBankAccounts(
  db: Client,
  bank: BankConnection,
  token: string,
) {
  const data = await plaidRequest<{ accounts: PlaidAccount[] }>(
    '/accounts/get',
    {
      access_token: token,
    },
  );
  for (const account of data.accounts) {
    const { error } = await db.from('plaid_accounts').upsert(
      {
        user_id: bank.user_id,
        connection_id: bank.id,
        bank_account_id: account.account_id,
        name: account.name.slice(0, 200),
        mask: account.mask,
      },
      { onConflict: 'connection_id,bank_account_id', ignoreDuplicates: true },
    );
    if (error)
      throw new Error('Could not save bank accounts. Updates will retry.');
  }
}

export async function syncBank(
  db: Client,
  bank: BankConnection,
  { automatic = false, background = false } = {},
) {
  const { data: lease, error: claimError } = await db.rpc('claim_plaid_sync', {
    p_connection: bank.id,
    p_automatic: automatic,
  });
  if (claimError) throw new Error('Unable to start bank updates.');
  if (!lease) return { busy: true, result: null };
  let syncError: string | null = null;
  try {
    const saved = await db
      .from('plaid_connections')
      .select('*')
      .eq('id', bank.id)
      .eq('user_id', bank.user_id)
      .single();
    if (saved.error || saved.data.disconnected || !saved.data.encrypted_token)
      throw new Error('Bank connection is unavailable.');
    bank = saved.data;
    const config = plaidConfig();
    if (bank.environment !== config.environment)
      throw new Error('This bank belongs to a different Plaid environment.');
    const token = decryptToken(
      bank.encrypted_token!,
      config.encryptionKey,
      `${bank.user_id}:${bank.id}`,
    );
    const url = webhookUrl();
    if (url && bank.webhook_url !== url) {
      await plaidRequest('/item/webhook/update', {
        access_token: token,
        webhook: url,
      });
      const savedWebhook = await db
        .from('plaid_connections')
        .update({ webhook_url: url })
        .eq('id', bank.id)
        .eq('user_id', bank.user_id);
      if (savedWebhook.error)
        throw new Error('Unable to save background update settings.');
    }
    await saveBankAccounts(db, bank, token);
    // Refresh history once to classify records fetched by the earlier manual importer.
    const updates = await collectSync(
      bank.classification_ready ? bank.cursor : null,
      (cursor) =>
        plaidRequest<SyncPage>('/transactions/sync', {
          access_token: token,
          ...(cursor ? { cursor } : {}),
          count: 500,
        }),
    );
    const { data, error } = await db.rpc(
      background ? 'sync_plaid_background' : 'sync_plaid_transactions',
      {
        p_connection: bank.id,
        p_previous: bank.cursor,
        p_cursor: updates.cursor,
        p_rows: updates.rows,
        p_removed: updates.removed,
      },
    );
    if (error)
      throw new Error(
        'Updates could not be saved. They will retry without skipping transactions.',
      );
    return { busy: false, result: data };
  } catch (error) {
    syncError =
      error instanceof Error
        ? error.message
        : 'Bank updates failed. They will retry.';
    throw new Error(syncError);
  } finally {
    const { error } = await db
      .from('plaid_connections')
      .update({
        sync_lease: null,
        sync_started_at: null,
        sync_error: syncError,
      })
      .eq('id', bank.id)
      .eq('user_id', bank.user_id)
      .eq('sync_lease', lease);
    if (error)
      throw new Error('Unable to finish bank updates. They will retry.');
  }
}
