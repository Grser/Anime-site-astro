import type { APIRoute } from 'astro';
import db from '../../../../lib/db';

export const prerender = false;

export const PUT: APIRoute = async ({ params, request }) => {
  const { id } = params;
  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  // Sólo permitimos estos dos campos
  const allowed = ['carrucel_1', 'destacado_reciente'];
  const entries = Object.entries(body).filter(([k]) => allowed.includes(k));

  if (entries.length === 0) {
    return new Response(null, { status: 400 });
  }

  // Construimos SET ... = ?, ... y valores
  const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
  const values    = entries.map(([_, v]) => v);

  try {
    await db.query(
      `UPDATE series SET ${setClause} WHERE id = ?`,
      [ ...values, id ]
    );
    return new Response(null, { status: 204 });
  } catch (e) {
    console.error('API PUT /api/series/:id error', e);
    return new Response(null, { status: 500 });
  }
};
