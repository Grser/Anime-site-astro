import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import { getSessionUser } from '../../../lib/session';
import { json } from '../../../lib/http';

const MAX_PERFILES_ABSOLUTO = 5;
// Fallback cuando el plan del usuario no está en la tabla suscripciones
// (ej. "Gratis", legacy, o nombre que no matchea).
const MAX_PERFILES_SIN_PLAN = 1;

/** Devuelve cuántos perfiles permite el plan del usuario. Nunca > MAX_PERFILES_ABSOLUTO. */
const resolveMaxPerfiles = async (userId: number): Promise<number> => {
  try {
    const [[row]] = await db.query<any[]>(
      `SELECT COALESCE(s.max_perfiles, ?) AS max_perfiles
         FROM usuarios u
         LEFT JOIN suscripciones s ON LOWER(s.nombre) = LOWER(u.suscripcion)
        WHERE u.id = ?
        LIMIT 1`,
      [MAX_PERFILES_SIN_PLAN, userId]
    );
    const n = Number(row?.max_perfiles ?? MAX_PERFILES_SIN_PLAN);
    if (!Number.isInteger(n) || n < 1) return MAX_PERFILES_SIN_PLAN;
    return Math.min(n, MAX_PERFILES_ABSOLUTO);
  } catch {
    // Si la columna max_perfiles aún no existe (migración pendiente), caer a 1.
    return MAX_PERFILES_SIN_PLAN;
  }
};

type PerfilRow = {
  id: number;
  usuario_id: number;
  nombre: string;
  avatar: string | null;
  es_nino: number;
  maturity_level: number;
  es_principal: number;
  orden: number;
};

const sanitizeNombre = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < 1 || text.length > 60) return null;
  return text;
};

const sanitizeAvatar = (value: unknown): string | null => {
  if (value == null) return null;
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  if (text.length > 255) return null;
  if (!/^(\/|https:\/\/)/.test(text)) return null;
  return text;
};

const sanitizeMaturity = (value: unknown): number => {
  const n = Number(value ?? 2);
  if (!Number.isInteger(n) || n < 0 || n > 2) return 2;
  return n;
};

export const GET: APIRoute = async ({ cookies }) => {
  const user = await getSessionUser(cookies);
  if (!user) return json({ error: 'No autenticado' }, 401);

  const [rows] = await db.query<PerfilRow[]>(
    `SELECT id, nombre, avatar, es_nino, maturity_level, es_principal, orden
       FROM perfiles
      WHERE usuario_id = ?
      ORDER BY es_principal DESC, orden ASC, id ASC`,
    [user.id]
  );

  const max = await resolveMaxPerfiles(user.id);

  return json({
    perfiles: (rows as PerfilRow[]).map((p) => ({
      id: Number(p.id),
      nombre: String(p.nombre),
      avatar: p.avatar,
      esNino: Number(p.es_nino) === 1,
      maturityLevel: Number(p.maturity_level),
      esPrincipal: Number(p.es_principal) === 1,
      orden: Number(p.orden),
    })),
    activoId: user.perfilId,
    max,
    plan: user.suscripcion,
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await getSessionUser(cookies);
  if (!user) return json({ error: 'No autenticado' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Solicitud inválida' }, 400);
  }

  const nombre = sanitizeNombre(body.nombre);
  if (!nombre) return json({ error: 'Nombre inválido (1-60 caracteres)' }, 400);
  const avatar = sanitizeAvatar(body.avatar);
  const esNino = body.esNino ? 1 : 0;
  const maturityLevel = esNino ? 0 : sanitizeMaturity(body.maturityLevel);

  const [[countRow]] = await db.query<any[]>(
    'SELECT COUNT(*) AS total FROM perfiles WHERE usuario_id = ?',
    [user.id]
  );
  const max = await resolveMaxPerfiles(user.id);
  if (Number(countRow?.total ?? 0) >= max) {
    const planLabel = user.suscripcion || 'Gratis';
    return json(
      {
        error: `Tu plan ${planLabel} permite hasta ${max} perfil${max === 1 ? '' : 'es'}. Mejora tu plan para añadir más.`,
        max,
        plan: planLabel,
      },
      403
    );
  }

  const [[dupRow]] = await db.query<any[]>(
    'SELECT id FROM perfiles WHERE usuario_id = ? AND LOWER(nombre) = LOWER(?) LIMIT 1',
    [user.id, nombre]
  );
  if (dupRow) return json({ error: 'Ya tienes un perfil con ese nombre' }, 409);

  const [result] = await db.query<any>(
    `INSERT INTO perfiles (usuario_id, nombre, avatar, es_nino, maturity_level, orden)
     VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(orden), -1) + 1 FROM (SELECT orden FROM perfiles WHERE usuario_id = ?) AS p))`,
    [user.id, nombre, avatar, esNino, maturityLevel, user.id]
  );

  return json({
    perfil: {
      id: Number((result as any).insertId),
      nombre,
      avatar,
      esNino: esNino === 1,
      maturityLevel,
      esPrincipal: false,
    },
  }, 201);
};
