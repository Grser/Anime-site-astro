// src/pages/api/series/[id]/reaction.ts
import type { APIRoute } from 'astro';
import db from '../../../../lib/db';

export const prerender = false;

// GET: devuelve totales y mi reacción (si estoy logeado)
export const GET: APIRoute = async ({ params, cookies }) => {
  const serieId = Number(params.id);
  let likes = 0, dislikes = 0, reaction: 'like'|'dislike'|null = null;

  // contar likes/dislikes
  const [[lrow]] = await db.query(
    `SELECT COUNT(*) AS likes FROM likes_dislikes WHERE serie_id = ? AND tipo = 'like'`,
    [serieId]
  );
  const [[drow]] = await db.query(
    `SELECT COUNT(*) AS dislikes FROM likes_dislikes WHERE serie_id = ? AND tipo = 'dislike'`,
    [serieId]
  );
  likes = lrow.likes;
  dislikes = drow.dislikes;

  // si hay cookie de sesión, busco mi reacción
  const nickname = cookies.get('session')?.value;
  if (nickname) {
    const [[user]] = await db.query(
      `SELECT id FROM usuarios WHERE nickname = ?`,
      [nickname]
    );
    if (user) {
      const [[erow]] = await db.query(
        `SELECT tipo FROM likes_dislikes WHERE serie_id = ? AND usuario_id = ?`,
        [serieId, user.id]
      );
      reaction = erow?.tipo ?? null;
    }
  }

  return new Response(JSON.stringify({ likes, dislikes, reaction }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

// POST: toggle like/dislike
export const POST: APIRoute = async ({ params, request, cookies }) => {
  const serieId = Number(params.id);
  const { type } = await request.json();
  if (type !== 'like' && type !== 'dislike') {
    return new Response(JSON.stringify({ error: 'Tipo inválido' }), { status: 400 });
  }

  const nickname = cookies.get('session')?.value;
  if (!nickname) {
    return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });
  }

  const [[user]] = await db.query(`SELECT id FROM usuarios WHERE nickname = ?`, [nickname]);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Usuario no existe' }), { status: 404 });
  }
  const userId = user.id;

  // verifico existencia
  const [[existing]] = await db.query(
    `SELECT id, tipo FROM likes_dislikes WHERE serie_id = ? AND usuario_id = ?`,
    [serieId, userId]
  );

  if (!existing) {
    // nuevo
    await db.query(
      `INSERT INTO likes_dislikes (serie_id, usuario_id, tipo) VALUES (?, ?, ?)`,
      [serieId, userId, type]
    );
  } else if (existing.tipo === type) {
    // misma reacción → elimino
    await db.query(`DELETE FROM likes_dislikes WHERE id = ?`, [existing.id]);
  } else {
    // distinta → actualizo
    await db.query(
      `UPDATE likes_dislikes SET tipo = ? WHERE id = ?`,
      [type, existing.id]
    );
  }

  // respondemos igual que GET
  return GET({ params, cookies, request } as any);
};
