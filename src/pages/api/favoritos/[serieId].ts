import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import { getSessionUser } from '../../../lib/session';

export const POST: APIRoute = async ({ params, cookies }) => {
  const serieId = Number(params.serieId);
  const user = await getSessionUser(cookies);

  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Usuario no autenticado' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!user.perfilId) {
    return new Response(
      JSON.stringify({ error: 'Selecciona un perfil antes de agregar favoritos' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!Number.isInteger(serieId) || serieId <= 0) {
    return new Response(
      JSON.stringify({ error: 'Serie no válida' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const [[existing]] = await db.query<{ id: number }[]>(
      `SELECT id FROM favoritos WHERE perfil_id = ? AND serie_id = ? LIMIT 1`,
      [user.perfilId, serieId]
    );

    const [[serie]] = await db.query<{ id: number }[]>('SELECT id FROM series WHERE id = ? LIMIT 1', [serieId]);
    if (!serie) {
      return new Response(
        JSON.stringify({ error: 'Serie no encontrada' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let favorito: boolean;

    if (existing?.id) {
      await db.query(`DELETE FROM favoritos WHERE id = ?`, [existing.id]);
      favorito = false;
    } else {
      await db.query(
        `INSERT INTO favoritos (usuario_id, perfil_id, serie_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE fecha_agregado = CURRENT_TIMESTAMP()`,
        [user.id, user.perfilId, serieId]
      );
      favorito = true;
    }

    return new Response(
      JSON.stringify({ favorito }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error al actualizar favorito:', error);
    return new Response(
      JSON.stringify({ error: 'No se pudo actualizar el favorito' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
