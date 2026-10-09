import { createHash, timingSafeEqual } from 'node:crypto';
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from 'jose';

export type VerificationKey = JWK & { expired_at?: number | null };

export async function verifyPlaidWebhook(
  body: string,
  signature: string | null,
  fetchKey: (id: string) => Promise<VerificationKey>,
) {
  if (!signature || signature.length > 4096)
    throw new Error('Invalid webhook signature.');
  const header = decodeProtectedHeader(signature);
  if (header.alg !== 'ES256' || !header.kid || header.kid.length > 200)
    throw new Error('Invalid webhook signature.');
  const jwk = await fetchKey(header.kid);
  if (jwk.expired_at || jwk.alg !== 'ES256' || jwk.kid !== header.kid)
    throw new Error('Invalid webhook verification key.');
  const { payload } = await jwtVerify(
    signature,
    await importJWK(jwk, 'ES256'),
    {
      algorithms: ['ES256'],
      maxTokenAge: '5 min',
    },
  );
  const hash = payload.request_body_sha256;
  if (typeof hash !== 'string' || !/^[a-f\d]{64}$/i.test(hash))
    throw new Error('Invalid webhook body hash.');
  // Hash the original bytes; parsing and reserializing JSON changes the signature.
  const actual = createHash('sha256').update(body).digest();
  if (!timingSafeEqual(actual, Buffer.from(hash, 'hex')))
    throw new Error('Invalid webhook body hash.');
}
