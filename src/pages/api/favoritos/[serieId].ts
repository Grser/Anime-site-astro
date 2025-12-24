import type { APIRoute } from 'astro';
import db from '../../../lib/db';

export const POST: APIRoute = async ({ params, cookies }) => {
  const serieId = Number(params.serieId);
  const usuarioId = Number(cookies.get('usuario_id')?.value);

  if (!usuarioId) {
    return new Response(
      JSON.stringify({ error: 'Usuario no autenticado' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!serieId) {
    return new Response(
      JSON.stringify({ error: 'Serie no válida' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const [[existing]] = await db.query<{ id: number }[]>(
      `SELECT id FROM favoritos WHERE usuario_id = ? AND serie_id = ? LIMIT 1`,
      [usuarioId, serieId]
    );

    let favorito: boolean;

    if (existing?.id) {
      await db.query(`DELETE FROM favoritos WHERE id = ?`, [existing.id]);
      favorito = false;
    } else {
      await db.query(
        `INSERT INTO favoritos (usuario_id, serie_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE fecha_agregado = CURRENT_TIMESTAMP()`,
        [usuarioId, serieId]
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
