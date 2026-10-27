import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import { ensureCommunityTables } from '../../../lib/community';
import { getSessionUser } from '../../../lib/session';
import { hitRateLimit, tooManyRequests } from '../../../lib/rate-limit';
import { json } from '../../../lib/http';

export const prerender = false;

// Antes los comentarios se guardaban sólo en el localStorage del navegador: nadie más
// los veía y se perdían al cambiar de dispositivo. Ahora se guardan en la base de datos.

const parseId = (value?: string | null) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const noStore = { 'Cache-Control': 'no-store' };

export const GET: APIRoute = async ({ params }) => {
  const episodioId = parseId(params.episodioId);
  if (!episodioId) return json({ error: 'Episodio inválido.' }, 400);

  try {
    await ensureCommunityTables();
    const [rows] = await db.query<any[]>(
      `SELECT c.id, c.usuario_id, c.texto, c.created_at,
              COALESCE(NULLIF(u.apodo, ''), u.nickname, 'Usuario') AS autor
         FROM comentarios c
         LEFT JOIN usuarios u ON u.id = c.usuario_id
        WHERE c.episodio_id = ?
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT 100`,
      [episodioId]
    );

    return json(
      {
        comments: (Array.isArray(rows) ? rows : []).map((row) => ({
          id: Number(row.id),
          userId: Number(row.usuario_id),
          name: String(row.autor),
          text: String(row.texto),
          createdAt: row.created_at,
        })),
      },
      200,
      noStore
    );
  } catch (error: any) {
    // Si la tabla todavía tiene el esquema viejo (usuario_nickname, comentario,
    // fecha) la query de arriba revienta con "Unknown column". Antes eso tiraba
    // 500 y rompía el error overlay del dev. Devolvemos lista vacía y log, hasta
    // que la migración 2026-10-27-comentarios-esquema.sql corra.
    console.error('No se pudo leer comentarios (¿esquema viejo?):', error?.sqlMessage || error?.message || error);
    return json({ comments: [], degraded: true }, 200, noStore);
  }
};

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const user = await getSessionUser(cookies);
  if (!user) return json({ error: 'Inicia sesión para comentar.' }, 401);

  const episodioId = parseId(params.episodioId);
  if (!episodioId) return json({ error: 'Episodio inválido.' }, 400);

  let text = '';
  try {
    const body = await request.json();
    text = String(body?.text ?? '').replace(/\r\n/g, '\n').trim();
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }

  if (!text) return json({ error: 'Escribe algo antes de publicar.' }, 400);
  if (text.length > 1000) return json({ error: 'El comentario no puede superar 1000 caracteres.' }, 400);

  const wait = hitRateLimit(`comment:${user.id}`, 6, 60_000);
  if (wait) return tooManyRequests(wait);

  const [[episode]] = await db.query<{ id: number }[]>('SELECT id FROM episodios WHERE id = ? LIMIT 1', [episodioId]);
  if (!episode) return json({ error: 'Episodio no encontrado.' }, 404);

  await ensureCommunityTables();
  const [result] = await db.query(
    'INSERT INTO comentarios (episodio_id, usuario_id, texto) VALUES (?, ?, ?)',
    [episodioId, user.id, text]
  );

  return json(
    {
      comment: {
        id: Number((result as any).insertId),
        userId: user.id,
        name: user.apodo || user.nickname,
        text,
        createdAt: new Date().toISOString(),
      },
    },
    201,
    noStore
  );
};

export const DELETE: APIRoute = async ({ params, url, cookies }) => {
  const user = await getSessionUser(cookies);
  if (!user) return json({ error: 'No autorizado.' }, 401);

  const episodioId = parseId(params.episodioId);
  const commentId = parseId(url.searchParams.get('id'));
  if (!episodioId || !commentId) return json({ error: 'Comentario inválido.' }, 400);

  await ensureCommunityTables();
  const [result] = user.esAdmin
    ? await db.query('DELETE FROM comentarios WHERE id = ? AND episodio_id = ?', [commentId, episodioId])
    : await db.query('DELETE FROM comentarios WHERE id = ? AND episodio_id = ? AND usuario_id = ?', [
        commentId,
        episodioId,
        user.id,
      ]);

  if (!(result as any).affectedRows) return json({ error: 'No puedes eliminar este comentario.' }, 404);
  return json({ ok: true }, 200, noStore);
};
