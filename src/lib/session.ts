import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';
import db from './db';
import { readEnv } from './env';

/**
 * Sesiones firmadas con soporte multi-perfil.
 *
 * El token lleva `userId.perfilId.exp.sig`:
 *   - perfilId > 0 → ese perfil específico fue elegido (ej. tras el picker).
 *   - perfilId == 0 → "no elegido todavía"; se usa el perfil es_principal.
 *   - Formato legacy (3 partes `userId.exp.sig`) se acepta como perfilId == 0.
 *
 * La firma incluye una huella del hash de la contraseña, así cambiar la contraseña
 * cierra todas las sesiones. Cambiar de perfil reemite el token pero mantiene userId.
 */

export const SESSION_COOKIE = 'cv_session';
const LEGACY_COOKIES = ['session', 'usuario_id'];
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 días

export type SessionUser = {
  id: number;
  nickname: string;
  apodo: string | null;
  imagen: string | null;
  esAdmin: boolean;
  suscripcion: string;
  region: string | null;
  // Perfil activo (siempre resuelto; es_principal si el token lleva perfilId=0)
  perfilId: number;
  perfilNombre: string;
  perfilAvatar: string | null;
  esNino: boolean;
  maturityLevel: number;
  // Cantidad total de perfiles del usuario (útil para decidir si mostrar picker)
  perfilesCount: number;
  // true cuando la cookie trae un perfilId explícito que coincide con uno real
  // del usuario. false cuando se resolvió por defecto (principal) o cuando aún no
  // eligió. El middleware usa esto para decidir si mandar al picker.
  perfilPicked: boolean;
};

let secret = readEnv('SESSION_SECRET');
if (!secret || secret.length < 32) {
  if (secret) console.warn('[session] SESSION_SECRET es demasiado corto (mínimo 32 caracteres).');
  console.warn(
    '[session] SESSION_SECRET no está configurado: se generó uno temporal y las sesiones ' +
      'se cerrarán cada vez que se reinicie el servidor.'
  );
  secret = randomBytes(48).toString('hex');
}
const SECRET = secret;

const passwordFingerprint = (passwordHash: string) =>
  createHash('sha256').update(String(passwordHash || '')).digest('base64url').slice(0, 16);

const sign = (payload: string) => createHmac('sha256', SECRET).update(payload).digest('base64url');

export const createSessionToken = (userId: number, passwordHash: string, perfilId: number = 0) => {
  const expires = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const safePerfilId = Number.isInteger(perfilId) && perfilId > 0 ? perfilId : 0;
  const payload = `${userId}.${safePerfilId}.${expires}`;
  return `${payload}.${sign(`${payload}.${passwordFingerprint(passwordHash)}`)}`;
};

type ParsedToken = {
  userId: number;
  perfilId: number;
  expires: number;
  signature: string;
  payload: string;
};

const parseToken = (token: string | undefined): ParsedToken | null => {
  if (!token) return null;
  const parts = token.split('.');
  // 4 partes: nuevo formato userId.perfilId.exp.sig
  // 3 partes: formato legacy userId.exp.sig (perfilId implícito = 0)
  if (parts.length !== 3 && parts.length !== 4) return null;

  const legacy = parts.length === 3;
  const userId = Number(parts[0]);
  const perfilId = legacy ? 0 : Number(parts[1]);
  const expires = Number(parts[legacy ? 1 : 2]);
  const signature = parts[legacy ? 2 : 3];

  if (!Number.isInteger(userId) || userId <= 0) return null;
  if (!Number.isInteger(perfilId) || perfilId < 0) return null;
  if (!Number.isInteger(expires) || expires * 1000 < Date.now()) return null;

  const payload = legacy ? `${parts[0]}.${parts[1]}` : `${parts[0]}.${parts[1]}.${parts[2]}`;
  return { userId, perfilId, expires, signature, payload };
};

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

const isSecureRequest = (request?: Request) => {
  if (!request) return false;
  try {
    if (new URL(request.url).protocol === 'https:') return true;
  } catch {
    // ignorar
  }
  return (request.headers.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https';
};

const writeCookie = (
  cookies: AstroCookies,
  token: string,
  request?: Request
) => {
  cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(request),
    maxAge: SESSION_MAX_AGE,
  });
  for (const name of LEGACY_COOKIES) cookies.delete(name, { path: '/' });
  sessionCache.delete(cookies);
};

export const setSessionCookie = (
  cookies: AstroCookies,
  user: { id: number; password: string },
  request?: Request,
  perfilId: number = 0
) => {
  writeCookie(cookies, createSessionToken(user.id, user.password, perfilId), request);
};

/**
 * Reemite el token manteniendo el mismo usuario pero cambiando (o fijando) el perfil activo.
 * Útil para el flujo "elegir perfil" / "cambiar de perfil" sin pedir contraseña otra vez.
 */
export const setSessionProfile = async (
  cookies: AstroCookies,
  userId: number,
  perfilId: number,
  request?: Request
): Promise<boolean> => {
  const [rows] = await db.query<any[]>(
    `SELECT u.password
       FROM usuarios u
       JOIN perfiles p ON p.usuario_id = u.id
      WHERE u.id = ? AND p.id = ?
      LIMIT 1`,
    [userId, perfilId]
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return false;
  writeCookie(cookies, createSessionToken(userId, row.password, perfilId), request);
  return true;
};

export const clearSessionCookie = (cookies: AstroCookies) => {
  cookies.delete(SESSION_COOKIE, { path: '/' });
  for (const name of LEGACY_COOKIES) cookies.delete(name, { path: '/' });
  sessionCache.set(cookies, Promise.resolve(null));
};

export const clearLegacyCookies = (cookies: AstroCookies) => {
  for (const name of LEGACY_COOKIES) {
    if (cookies.has(name)) cookies.delete(name, { path: '/' });
  }
};

const DEFAULT_AVATAR = '/avatar.jpeg';
export const normalizeAvatar = (value: unknown) => {
  const url = typeof value === 'string' ? value.trim() : '';
  // La imagen por defecto antigua apuntaba a un servidor http con IP fija que ya no
  // carga en https (contenido mixto).
  if (!url || url.startsWith('http://')) return DEFAULT_AVATAR;
  return url;
};

const loadSessionUser = async (cookies: AstroCookies): Promise<SessionUser | null> => {
  const token = parseToken(cookies.get(SESSION_COOKIE)?.value);
  if (!token) return null;

  const [rows] = await db.query<any[]>(
    `SELECT id, nickname, apodo, imagen, es_admin, suscripcion, region, password, baneado
       FROM usuarios
      WHERE id = ?
      LIMIT 1`,
    [token.userId]
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;

  const expected = sign(`${token.payload}.${passwordFingerprint(row.password)}`);
  if (!safeEqual(expected, token.signature)) return null;
  if (Number(row.baneado) === 1) return null;

  // Resolver el perfil activo. Si el token trae perfilId > 0, exigir que pertenezca
  // a este usuario; si no, caer al perfil principal. Si no hay ningún perfil (ej. la
  // migración aún no se corrió), seguir funcionando con valores por defecto derivados
  // del usuario — así ninguna página explota mientras se completa el chunk C.
  let perfil: {
    id: number;
    nombre: string;
    avatar: string | null;
    es_nino: number;
    maturity_level: number;
  } | null = null;

  let perfilesCount = 0;
  let perfilPicked = false;

  try {
    const [countRows] = await db.query<any[]>(
      'SELECT COUNT(*) AS total FROM perfiles WHERE usuario_id = ?',
      [token.userId]
    );
    perfilesCount = Number(countRows?.[0]?.total ?? 0);

    if (token.perfilId > 0) {
      const [perfilRows] = await db.query<any[]>(
        `SELECT id, nombre, avatar, es_nino, maturity_level
           FROM perfiles
          WHERE id = ? AND usuario_id = ?
          LIMIT 1`,
        [token.perfilId, token.userId]
      );
      perfil = Array.isArray(perfilRows) ? perfilRows[0] ?? null : null;
      perfilPicked = perfil !== null;
    }
    if (!perfil) {
      const [principalRows] = await db.query<any[]>(
        `SELECT id, nombre, avatar, es_nino, maturity_level
           FROM perfiles
          WHERE usuario_id = ?
          ORDER BY es_principal DESC, orden ASC, id ASC
          LIMIT 1`,
        [token.userId]
      );
      perfil = Array.isArray(principalRows) ? principalRows[0] ?? null : null;
    }
  } catch (err) {
    // La tabla perfiles aún no existe (migración pendiente). Degradar sin romper
    // la sesión: usar los datos del usuario como perfil implícito.
    console.warn('[session] Tabla perfiles no disponible, usando perfil implícito:', (err as Error).message);
  }

  return {
    id: Number(row.id),
    nickname: String(row.nickname),
    apodo: row.apodo ?? null,
    imagen: normalizeAvatar(row.imagen),
    esAdmin: Number(row.es_admin) === 1,
    suscripcion: row.suscripcion || 'Gratis',
    region: row.region ?? null,
    perfilId: perfil ? Number(perfil.id) : 0,
    perfilNombre: perfil ? String(perfil.nombre) : (row.apodo || row.nickname || ''),
    perfilAvatar: perfil ? normalizeAvatar(perfil.avatar) : normalizeAvatar(row.imagen),
    esNino: perfil ? Number(perfil.es_nino) === 1 : false,
    maturityLevel: perfil ? Number(perfil.maturity_level) : 2,
    perfilesCount,
    perfilPicked,
  };
};

// El mismo objeto `cookies` se comparte entre el middleware y la página/endpoint de
// una petición, así que la sesión se resuelve una sola vez por petición.
const sessionCache = new WeakMap<AstroCookies, Promise<SessionUser | null>>();

export const getSessionUser = (cookies: AstroCookies): Promise<SessionUser | null> => {
  let pending = sessionCache.get(cookies);
  if (!pending) {
    pending = loadSessionUser(cookies).catch((error) => {
      console.error('[session] No se pudo validar la sesión', error);
      return null;
    });
    sessionCache.set(cookies, pending);
  }
  return pending;
};

export const getSessionUserId = async (cookies: AstroCookies): Promise<number | null> =>
  (await getSessionUser(cookies))?.id ?? null;

/**
 * Devuelve el id del perfil activo (resuelto desde el token o es_principal).
 * Las APIs per-perfil (favoritos, historial, likes_dislikes, notificaciones_series,
 * notificaciones) deberían preferir esta sobre getSessionUserId para scopear
 * correctamente la personalización.
 *
 * Retorna 0 si no hay sesión o si el usuario todavía no tiene ningún perfil creado
 * (DB sin migrar). Los callers pueden tratar 0 como "sin perfil activo" y rechazar
 * la operación, o pueden caer a usuario_id como fallback para compatibilidad.
 */
export const getActiveProfileId = async (cookies: AstroCookies): Promise<number> =>
  (await getSessionUser(cookies))?.perfilId ?? 0;
