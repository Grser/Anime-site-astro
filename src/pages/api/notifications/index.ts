import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import { ensureCommunityTables } from '../../../lib/community';
import { getSessionUser } from '../../../lib/session';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export const GET: APIRoute = async ({ cookies, url }) => {
  const user = await getSessionUser(cookies);
  if (!user) return json({ notifications: [], unreadCount: 0 }, 200);
  if (!user.perfilId) return json({ notifications: [], unreadCount: 0 }, 200);

  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit')) || 8));
  await ensureCommunityTables();

  const [[countRow]] = await db.query<{ total: number }[]>(
    'SELECT COUNT(*) AS total FROM notificaciones WHERE perfil_id = ? AND leida = 0',
    [user.perfilId]
  );
  const [rows] = await db.query(
    `SELECT id, tipo, titulo, mensaje, enlace, leida, created_at
       FROM notificaciones
      WHERE perfil_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
    [user.perfilId, limit]
  );

  return json({ notifications: rows, unreadCount: Number(countRow?.total || 0) });
};

export const PATCH: APIRoute = async ({ request, cookies }) => {
  const user = await getSessionUser(cookies);
  if (!user) return json({ error: 'No autorizado.' }, 401);
  if (!user.perfilId) return json({ error: 'Perfil no seleccionado.' }, 409);

  let payload: Record<string, unknown> = {};
  try {
    payload = await request.json();
  } catch {
    // Un cuerpo vacío equivale a marcar todas como leídas.
  }

  await ensureCommunityTables();
  const id = Number(payload.id);
  if (id > 0) {
    // Permitir marcar leída la notificación individual aunque esté asociada a otro
    // perfil del mismo usuario, para evitar confusión en migraciones legacy.
    await db.query('UPDATE notificaciones SET leida = 1 WHERE id = ? AND usuario_id = ?', [id, user.id]);
  } else {
    // "Marcar todas" aplica solo al perfil activo.
    await db.query('UPDATE notificaciones SET leida = 1 WHERE perfil_id = ? AND leida = 0', [user.perfilId]);
  }

  return json({ ok: true });
};
