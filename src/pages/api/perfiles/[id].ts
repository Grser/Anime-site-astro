import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import { clearSessionCookie, getSessionUser, setSessionCookie } from '../../../lib/session';
import { json } from '../../../lib/http';

const parseId = (raw: string | undefined) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const sanitizeNombre = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < 1 || text.length > 60) return null;
  return text;
};

const sanitizeAvatar = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value == null) return null;
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  if (text.length > 255) return null;
  if (!/^(\/|https:\/\/)/.test(text)) return null;
  return text;
};

const sanitizeMaturity = (value: unknown): number | null => {
  if (value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 2) return null;
  return n;
};

const loadOwnedPerfil = async (userId: number, perfilId: number) => {
  const [rows] = await db.query<any[]>(
    `SELECT id, nombre, avatar, es_nino, maturity_level, es_principal
       FROM perfiles
      WHERE id = ? AND usuario_id = ?
      LIMIT 1`,
    [perfilId, userId]
  );
  return Array.isArray(rows) ? (rows[0] ?? null) : null;
};

export const PATCH: APIRoute = async ({ request, cookies, params }) => {
  const user = await getSessionUser(cookies);
  if (!user) return json({ error: 'No autenticado' }, 401);
  const perfilId = parseId(params.id);
  if (!perfilId) return json({ error: 'Perfil inválido' }, 400);

  const existing = await loadOwnedPerfil(user.id, perfilId);
  if (!existing) return json({ error: 'Perfil no encontrado' }, 404);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Solicitud inválida' }, 400);
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.nombre !== undefined) {
    const nombre = sanitizeNombre(body.nombre);
    if (!nombre) return json({ error: 'Nombre inválido (1-60 caracteres)' }, 400);
    if (nombre.toLowerCase() !== String(existing.nombre).toLowerCase()) {
      const [[dup]] = await db.query<any[]>(
        'SELECT id FROM perfiles WHERE usuario_id = ? AND LOWER(nombre) = LOWER(?) AND id <> ? LIMIT 1',
        [user.id, nombre, perfilId]
      );
      if (dup) return json({ error: 'Ya tienes un perfil con ese nombre' }, 409);
    }
    updates.push('nombre = ?');
    values.push(nombre);
  }

  const avatar = sanitizeAvatar(body.avatar);
  if (avatar !== undefined) {
    updates.push('avatar = ?');
    values.push(avatar);
  }

  if (body.esNino !== undefined) {
    const esNino = body.esNino ? 1 : 0;
    updates.push('es_nino = ?');
    values.push(esNino);
    if (esNino === 1) {
      updates.push('maturity_level = 0');
    }
  }

  if (body.maturityLevel !== undefined && !body.esNino) {
    const maturityLevel = sanitizeMaturity(body.maturityLevel);
    if (maturityLevel === null) return json({ error: 'Nivel de madurez inválido' }, 400);
    updates.push('maturity_level = ?');
    values.push(maturityLevel);
  }

  if (updates.length === 0) return json({ error: 'Nada que actualizar' }, 400);

  values.push(perfilId, user.id);
  await db.query(
    `UPDATE perfiles SET ${updates.join(', ')} WHERE id = ? AND usuario_id = ?`,
    values
  );

  const updated = await loadOwnedPerfil(user.id, perfilId);
  return json({
    perfil: {
      id: perfilId,
      nombre: String(updated.nombre),
      avatar: updated.avatar,
      esNino: Number(updated.es_nino) === 1,
      maturityLevel: Number(updated.maturity_level),
      esPrincipal: Number(updated.es_principal) === 1,
    },
  });
};

export const DELETE: APIRoute = async ({ cookies, params, request }) => {
  const user = await getSessionUser(cookies);
  if (!user) return json({ error: 'No autenticado' }, 401);
  const perfilId = parseId(params.id);
  if (!perfilId) return json({ error: 'Perfil inválido' }, 400);

  const existing = await loadOwnedPerfil(user.id, perfilId);
  if (!existing) return json({ error: 'Perfil no encontrado' }, 404);
  if (Number(existing.es_principal) === 1) {
    return json({ error: 'No se puede eliminar el perfil principal' }, 400);
  }

  // Si el perfil que se borra es el activo en la cookie, limpiarla para forzar la
  // selección en el próximo request (middleware o /perfiles).
  const wasActive = user.perfilId === perfilId;

  // El FK con ON DELETE CASCADE sobre usuario_id no cubre esto, pero perfil_id es NULL
  // en todas las tablas per-user, así que borrar el perfil deja huérfanos (NULL)
  // los registros asociados. Para no perderlos, los reasignamos al perfil principal.
  const [[principal]] = await db.query<any[]>(
    'SELECT id FROM perfiles WHERE usuario_id = ? AND es_principal = 1 LIMIT 1',
    [user.id]
  );
  const principalId = principal ? Number(principal.id) : null;

  if (principalId) {
    const perfilTables = ['historial', 'favoritos', 'likes_dislikes', 'notificaciones_series', 'notificaciones'];
    for (const t of perfilTables) {
      await db.query(`UPDATE ${t} SET perfil_id = ? WHERE perfil_id = ?`, [principalId, perfilId]);
    }
  }

  await db.query('DELETE FROM perfiles WHERE id = ? AND usuario_id = ?', [perfilId, user.id]);

  if (wasActive) {
    // Reemitir cookie con perfilId=0 → el loader caerá al principal.
    const [[u]] = await db.query<any[]>('SELECT password FROM usuarios WHERE id = ?', [user.id]);
    if (u) setSessionCookie(cookies, { id: user.id, password: u.password }, request, 0);
    else clearSessionCookie(cookies);
  }

  return json({ ok: true, reasignadosAPrincipal: principalId });
};
