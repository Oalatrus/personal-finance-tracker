import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key(value: string) {
  if (!/^[a-f\d]{64}$/i.test(value))
    throw new Error('Invalid token encryption key.');
  return Buffer.from(value, 'hex');
}

export function encryptToken(token: string, secret: string, owner: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  // Bind ciphertext to its owner and connection so copied tokens cannot be reused.
  cipher.setAAD(Buffer.from(owner));
  const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body]
    .map((part) => part.toString('base64url'))
    .join('.');
}

export function decryptToken(value: string, secret: string, owner: string) {
  const parts = value.split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted token.');
  const [iv, tag, body] = parts.map((part) => Buffer.from(part, 'base64url'));
  if (iv!.length !== 12 || tag!.length !== 16)
    throw new Error('Invalid encrypted token.');
  const cipher = createDecipheriv('aes-256-gcm', key(secret), iv!);
  cipher.setAAD(Buffer.from(owner));
  cipher.setAuthTag(tag!);
  return Buffer.concat([cipher.update(body!), cipher.final()]).toString('utf8');
}
