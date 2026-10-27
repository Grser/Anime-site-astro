import crypto from 'node:crypto';
import { readEnv } from './env';

// Token cifrado con AES-256-GCM que oculta la URL real del CDN de video al
// cliente, además de autenticarla (nadie puede forjar un token válido sin la
// clave). HMAC a secas no sirve porque el payload sería legible en base64.
//
// Formato: base64url(iv) + "." + base64url(ciphertext) + "." + base64url(tag)
// Payload cifrado = JSON { u: <url>, e: <expEpochSeconds> }

const resolveSecret = (): string => {
  const dedicated = readEnv('VIDEO_SIGNING_SECRET');
  if (dedicated) return dedicated;
  const session = readEnv('SESSION_SECRET');
  if (session) return session;
  // Fallback de desarrollo: documentado en .env.example que en prod hay que setear uno.
  return 'cv-dev-video-signing-secret-not-for-prod';
};

const SECRET = resolveSecret();
const KEY = crypto.createHash('sha256').update(SECRET).digest(); // 32 bytes exactos para AES-256
const DEFAULT_TTL_SECONDS = 60 * 60 * 2; // 2h; el cliente re-pide la página y obtiene tokens nuevos

const b64urlEncode = (buf: Buffer): string =>
  buf.toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');

const b64urlDecode = (value: string): Buffer => {
  const padLen = (4 - (value.length % 4)) % 4;
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  return Buffer.from(normalized, 'base64');
};

export interface SignVideoOptions {
  /** TTL en segundos (default 2h). */
  ttlSeconds?: number;
}

export const signVideoUrl = (url: string, opts: SignVideoOptions = {}): string => {
  const payload = {
    u: url,
    e: Math.floor(Date.now() / 1000) + (opts.ttlSeconds ?? DEFAULT_TTL_SECONDS),
  };
  const iv = crypto.randomBytes(12); // 96 bits recomendado para GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${b64urlEncode(iv)}.${b64urlEncode(encrypted)}.${b64urlEncode(tag)}`;
};

export const verifyVideoToken = (token: string): { url: string } | null => {
  if (typeof token !== 'string' || !token) return null;
  const [ivB64, encB64, tagB64] = token.split('.');
  if (!ivB64 || !encB64 || !tagB64) return null;

  let iv: Buffer, enc: Buffer, tag: Buffer;
  try {
    iv = b64urlDecode(ivB64);
    enc = b64urlDecode(encB64);
    tag = b64urlDecode(tagB64);
  } catch { return null; }
  if (iv.length !== 12 || tag.length !== 16) return null;

  let plaintext: string;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    // Tag inválido o payload corrupto → rechazo total.
    return null;
  }

  let payload: { u?: unknown; e?: unknown };
  try { payload = JSON.parse(plaintext); } catch { return null; }

  const url = typeof payload.u === 'string' ? payload.u : '';
  const exp = typeof payload.e === 'number' ? payload.e : 0;
  if (!url) return null;
  if (!exp || exp < Math.floor(Date.now() / 1000)) return null;
  return { url };
};
