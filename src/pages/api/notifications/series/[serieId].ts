import type { APIRoute } from 'astro';
import db from '../../../../lib/db';
import { ensureCommunityTables } from '../../../../lib/community';
import { getSessionUser } from '../../../../lib/session';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const parseSeriesId = (value?: string) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export const GET: APIRoute = async ({ params, cookies }) => {
  const user = await getSessionUser(cookies);
  if (!user) return json({ active: false, authenticated: false });
  if (!user.perfilId) return json({ active: false, authenticated: true, needsProfile: true });

  const seriesId = parseSeriesId(params.serieId);
  if (!seriesId) return json({ error: 'Serie inválida.' }, 400);

  await ensureCommunityTables();
  const [[row]] = await db.query<{ activa: number }[]>(
    'SELECT activa FROM notificaciones_series WHERE perfil_id = ? AND serie_id = ? LIMIT 1',
    [user.perfilId, seriesId]
  );

  return json({ active: row?.activa === 1, authenticated: true });
};

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const user = await getSessionUser(cookies);
  if (!user) return json({ error: 'Inicia sesión para activar notificaciones.' }, 401);
  if (!user.perfilId) return json({ error: 'Selecciona un perfil antes de activar notificaciones.' }, 409);

  const seriesId = parseSeriesId(params.serieId);
  if (!seriesId) return json({ error: 'Serie inválida.' }, 400);

  let requestedActive: boolean | null = null;
  try {
    const payload = await request.json();
    if (typeof payload?.active === 'boolean') requestedActive = payload.active;
  } catch {
    // Si no se indica el valor, se alterna el estado actual.
  }

  await ensureCommunityTables();
  const [[series]] = await db.query<{ id: number }[]>(
    'SELECT id FROM series WHERE id = ? LIMIT 1',
    [seriesId]
  );
  if (!series) return json({ error: 'Serie no encontrada.' }, 404);

  const [[current]] = await db.query<{ activa: number }[]>(
    'SELECT activa FROM notificaciones_series WHERE perfil_id = ? AND serie_id = ? LIMIT 1',
    [user.perfilId, seriesId]
  );
  const active = requestedActive ?? current?.activa !== 1;

  await db.query(
    `INSERT INTO notificaciones_series (usuario_id, perfil_id, serie_id, activa)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE activa = VALUES(activa), updated_at = CURRENT_TIMESTAMP`,
    [user.id, user.perfilId, seriesId, active ? 1 : 0]
  );

  return json({ ok: true, active });
};
