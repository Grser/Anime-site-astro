import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import { getSessionUser } from '../../../lib/session';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await getSessionUser(cookies);
  if (!user) return json({ error: 'Inicia sesión para actualizar tu historial.' }, 401);
  if (!user.perfilId) return json({ error: 'Selecciona un perfil antes de marcar episodios.' }, 409);

  let episodeId = 0;
  try {
    const body = await request.json();
    episodeId = Number(body?.episodeId);
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }

  if (!Number.isInteger(episodeId) || episodeId <= 0) {
    return json({ error: 'Episodio inválido.' }, 400);
  }

  const [[episode]] = await db.query<{ id: number; duracion: number | null }[]>(
    'SELECT id, duracion FROM episodios WHERE id = ? LIMIT 1',
    [episodeId]
  );
  if (!episode) return json({ error: 'Episodio no encontrado.' }, 404);

  const completedProgress = Math.max(1, Math.floor(Number(episode.duracion || 0) * 60));
  await db.query(
    `INSERT INTO historial (usuario_id, perfil_id, episodio_id, progreso, completado)
     VALUES (?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE progreso = ?, completado = 1, fecha_actualizacion = NOW()`,
    [user.id, user.perfilId, episodeId, completedProgress, completedProgress]
  );

  return json({ ok: true, completed: true });
};
