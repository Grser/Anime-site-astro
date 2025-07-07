import db from '../../../lib/db';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params }) => {
  const temporadaId = params.temporadaId;
  const [episodios] = await db.query(
    `SELECT * FROM episodios WHERE temporada_id = ? ORDER BY numero_episodio`,
    [temporadaId]
  );
  return new Response(JSON.stringify(episodios), {
    headers: { 'Content-Type': 'application/json' }
  });
};
