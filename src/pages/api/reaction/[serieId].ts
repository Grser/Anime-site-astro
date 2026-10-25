// src/pages/api/reaction/[serieId].ts
import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import { getSessionUser } from '../../../lib/session';

export const POST: APIRoute = async ({ params, request, cookies }) => {
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
      JSON.stringify({ error: 'Selecciona un perfil antes de reaccionar' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let tipo: unknown;
  try {
    ({ tipo } = await request.json());
  } catch {
    tipo = null;
  }
  if (tipo !== 'like' && tipo !== 'dislike') {
    return new Response(
      JSON.stringify({ error: 'Reacción inválida' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  if (!Number.isInteger(serieId) || serieId <= 0) {
    return new Response(
      JSON.stringify({ error: 'Serie no válida' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const [[existing]] = await db.query<{ tipo: string }[]>(
      `SELECT tipo
         FROM likes_dislikes
        WHERE perfil_id = ? AND serie_id = ?
        LIMIT 1`,
      [user.perfilId, serieId]
    );

    let newReaction: string | null;

    if (existing && existing.tipo === tipo) {
      await db.query(
        `DELETE FROM likes_dislikes
           WHERE perfil_id = ? AND serie_id = ?`,
        [user.perfilId, serieId]
      );
      newReaction = null;
    } else {
      await db.query(
        `INSERT INTO likes_dislikes (usuario_id, perfil_id, serie_id, tipo)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               tipo = VALUES(tipo),
               fecha_agregado = CURRENT_TIMESTAMP()`,
        [user.id, user.perfilId, serieId, tipo]
      );
      newReaction = tipo;
    }

    // Totales globales por serie (sin filtrar perfil) — se cuentan por filas,
    // así cada perfil distinto suma independiente aunque sea del mismo usuario.
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

    return new Response(
      JSON.stringify({ likes, dislikes, reaction: newReaction }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('💥 Error en reacción:', error);
    return new Response(
      JSON.stringify({ error: 'Error al procesar la reacción' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
