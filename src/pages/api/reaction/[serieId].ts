// src/pages/api/reaction/[serieId].ts
import type { APIRoute } from 'astro';
import db from '../../../lib/db';

export const POST: APIRoute = async ({ params, request, cookies }) => {

  // 3) Extraigo sólo la cookie que me interesa
  const serieId   = Number(params.serieId);
  const usuarioId = Number(cookies.get('usuario_id')?.value);

  // 4) JSON body
  const { tipo } = await request.json();

  // 5) Si no hay usuario_id en cookies, abortamos
  if (!usuarioId) {
    console.warn('⚠️ Usuario no autenticado intentando reaccionar');
    return new Response(
      JSON.stringify({ error: 'Usuario no autenticado' }),
      { status: 401 }
    );
  }

  try {
    // 6) Compruebo si ya existe una reacción previa
    const [[existing]] = await db.query<{ tipo: string }[]>(
      `SELECT tipo
         FROM likes_dislikes
        WHERE usuario_id = ? AND serie_id = ?
        LIMIT 1`,
      [usuarioId, serieId]
    );

    let newReaction: string | null;

    if (existing && existing.tipo === tipo) {
      // 7a) Si es el mismo tipo, elimino para desmarcar
      await db.query(
        `DELETE FROM likes_dislikes
           WHERE usuario_id = ? AND serie_id = ?`,
        [usuarioId, serieId]
      );
      newReaction = null;
    } else {
      // 7b) Si es diferente o no existía, inserto/actualizo
      await db.query(
        `INSERT INTO likes_dislikes (usuario_id, serie_id, tipo)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
               tipo = VALUES(tipo),
               fecha_agregado = CURRENT_TIMESTAMP()`,
        [usuarioId, serieId, tipo]
      );
      newReaction = tipo;
    }

    // 8) Recuento actualizado
    const [[{ total: likes }]] = await db.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total
         FROM likes_dislikes
        WHERE serie_id = ? AND tipo = 'like'`,
      [serieId]
    );
    const [[{ total: dislikes }]] = await db.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total
         FROM likes_dislikes
        WHERE serie_id = ? AND tipo = 'dislike'`,
      [serieId]
    );

    // 9) Respuesta final
    return new Response(
      JSON.stringify({ likes, dislikes, reaction: newReaction }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('💥 Error en reacción:', error);
    return new Response(
      JSON.stringify({ error: 'Error al procesar la reacción' }),
      { status: 500 }
    );
  }
};
