import type { AstroCookies } from 'astro';
import db from './db';

type AdminStatus = {
  usuarioId: number | null;
  isAdmin: boolean;
};

const parseUserId = (cookies: AstroCookies) => {
  const raw = cookies.get('usuario_id')?.value;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
};

export const getAdminStatus = async (cookies: AstroCookies): Promise<AdminStatus> => {
  const usuarioId = parseUserId(cookies);
  if (!usuarioId) {
    return { usuarioId: null, isAdmin: false };
  }

  const [[row]] = await db.query<{ es_admin: number }[]>(
    'SELECT es_admin FROM usuarios WHERE id = ? LIMIT 1',
    [usuarioId]
  );

  return { usuarioId, isAdmin: row?.es_admin === 1 };
};

export const requireAdmin = async (
  cookies: AstroCookies
): Promise<{ usuarioId: number } | Response> => {
  const usuarioId = parseUserId(cookies);
  if (!usuarioId) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const [[row]] = await db.query<{ es_admin: number }[]>(
    'SELECT es_admin FROM usuarios WHERE id = ? LIMIT 1',
    [usuarioId]
  );

  if (!row || row.es_admin !== 1) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return { usuarioId };
};
