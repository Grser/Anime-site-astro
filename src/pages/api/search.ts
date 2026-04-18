import type { APIRoute } from 'astro';
import db from '../../lib/db';

export const prerender = false;

interface Serie {
  id: number;
  slug: string;
  titulo: string;
  icon: string;
  descripcion: string;
  genero?: string;
  temporada_count: number;
  episodio_count: number;
  match_score?: number;
}

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim();
  const limit = Math.min(Number(url.searchParams.get('limit') || 24), 40);

  if (!q) {
    return new Response(JSON.stringify({ results: [], query: '' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const normalizedQuery = q.toLowerCase();

  try {
    const [results] = await db.query<Serie[]>(
      `
      SELECT
        s.id,
        s.slug,
        s.titulo,
        s.icon,
        s.descripcion,
        s.genero,
        (SELECT COUNT(*) FROM temporadas t WHERE t.serie_id = s.id) AS temporada_count,
        (SELECT COUNT(*) FROM episodios e
           JOIN temporadas t ON e.temporada_id = t.id
           WHERE t.serie_id = s.id) AS episodio_count,
        CASE
          WHEN LOWER(s.titulo) = ? THEN 100
          WHEN LOWER(s.titulo) LIKE CONCAT(?, '%') THEN 85
          WHEN LOWER(s.titulo) LIKE CONCAT('%', ?, '%') THEN 70
          WHEN LOWER(COALESCE(s.genero, '')) LIKE CONCAT('%', ?, '%') THEN 35
          WHEN LOWER(COALESCE(s.descripcion, '')) LIKE CONCAT('%', ?, '%') THEN 20
          ELSE 0
        END AS match_score
      FROM series s
      WHERE LOWER(s.titulo) LIKE CONCAT('%', ?, '%')
         OR LOWER(COALESCE(s.genero, '')) LIKE CONCAT('%', ?, '%')
         OR LOWER(COALESCE(s.descripcion, '')) LIKE CONCAT('%', ?, '%')
      ORDER BY match_score DESC, s.titulo ASC
      LIMIT ?;
      `,
      [normalizedQuery, normalizedQuery, normalizedQuery, normalizedQuery, normalizedQuery, normalizedQuery, normalizedQuery, normalizedQuery, limit]
    );

    return new Response(JSON.stringify({ results, query: q }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error en la búsqueda', error);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
