import db from '../../../lib/db';
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ params, request }) => {
  const serieId = Number(params.serieId);
  const { usuarioId, tipo } = await request.json();

  // Borrar la reacción previa del usuario (solo una reacción permitida por usuario por serie)
  await db.query(
    `DELETE FROM likes_dislikes WHERE usuario_id = ? AND serie_id = ?`,
    [usuarioId, serieId]
  );

  // Insertar nueva reacción
  await db.query(
    `INSERT INTO likes_dislikes (usuario_id, serie_id, tipo) VALUES (?, ?, ?)`,
    [usuarioId, serieId, tipo]
  );

  // Contar likes y dislikes actualizados
  const [[likeCount]] = await db.query(
    `SELECT COUNT(*) as total FROM likes_dislikes WHERE serie_id = ? AND tipo = 'like'`,
    [serieId]
  );
  const [[dislikeCount]] = await db.query(
    `SELECT COUNT(*) as total FROM likes_dislikes WHERE serie_id = ? AND tipo = 'dislike'`,
    [serieId]
  );

  return new Response(
    JSON.stringify({
      likes: likeCount.total,
      dislikes: dislikeCount.total,
      reaction: tipo,
    }),
    { status: 200 }
  );
};
