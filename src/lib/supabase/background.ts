import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { getSupabaseConfig } from './config';

export function createBackgroundClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret?.startsWith('sb_secret_'))
    throw new Error('Background bank updates are not configured.');
  // This client is used only after authenticating a Plaid webhook, never in the browser.
  return createClient<Database>(getSupabaseConfig().url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
