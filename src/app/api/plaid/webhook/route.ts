import { NextResponse } from 'next/server';
import { createBackgroundClient } from '@/lib/supabase/background';
import { plaidConfig, plaidRequest } from '@/lib/plaid/client';
import { verifyPlaidWebhook, type VerificationKey } from '@/lib/plaid/webhook';
import { syncBank } from '@/lib/plaid/sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!process.env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_'))
    return NextResponse.json(
      { error: 'Background updates are not configured.' },
      { status: 503 },
    );
  if (Number(request.headers.get('content-length') || 0) > 16_384)
    return new NextResponse(null, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return new NextResponse(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        return new NextResponse(null, { status: 413 });
      }
      chunks.push(chunk.value);
    }
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const body = Buffer.concat(chunks).toString('utf8');
  try {
    await verifyPlaidWebhook(
      body,
      request.headers.get('plaid-verification'),
      async (id) => {
        const result = await plaidRequest<{ key: VerificationKey }>(
          '/webhook_verification_key/get',
          { key_id: id },
        );
        return result.key;
      },
    );
  } catch {
    return NextResponse.json(
      { error: 'Webhook verification failed.' },
      { status: 401 },
    );
  }
  try {
    const event = JSON.parse(body);
    if (
      event.webhook_type !== 'TRANSACTIONS' ||
      ![
        'SYNC_UPDATES_AVAILABLE',
        'INITIAL_UPDATE',
        'HISTORICAL_UPDATE',
        'DEFAULT_UPDATE',
        'TRANSACTIONS_REMOVED',
      ].includes(event.webhook_code)
    )
      return NextResponse.json({ received: true });
    const config = plaidConfig();
    if (
      event.environment !== config.environment ||
      typeof event.item_id !== 'string'
    )
      return new NextResponse(null, { status: 400 });
    const db = createBackgroundClient();
    const saved = await db
      .from('plaid_connections')
      .select('*')
      .eq('item_id', event.item_id)
      .eq('environment', config.environment)
      .eq('disconnected', false)
      .maybeSingle();
    if (saved.error) throw new Error('Connection lookup failed.');
    if (!saved.data?.encrypted_token)
      return NextResponse.json({ received: true });
    const result = await syncBank(db, saved.data, { background: true });
    if (result.busy)
      return NextResponse.json(
        { retry: true },
        { status: 503, headers: { 'Retry-After': '120' } },
      );
    // Acknowledge only saved updates; Plaid retries failures and duplicate deliveries are safe.
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json(
      { error: 'Bank updates will retry.' },
      { status: 503 },
    );
  }
}
