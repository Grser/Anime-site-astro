import type { APIRoute } from 'astro';
import db from '../../lib/db';

export const prerender = false;

interface Serie {
  id: number;
  slug: string;
  titulo: string;
  icon: string;
  descripcion: string;
  temporada_count: number;
  episodio_count: number;
}

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim();

  if (!q) {
    return new Response(JSON.stringify({ results: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const [results] = await db.query<Serie[]>(
      `
      SELECT
        s.id,
        s.slug,
        s.titulo,
        s.icon,
        s.descripcion,
        (SELECT COUNT(*) FROM temporadas t WHERE t.serie_id = s.id) AS temporada_count,
        (SELECT COUNT(*) FROM episodios e
           JOIN temporadas t ON e.temporada_id = t.id
           WHERE t.serie_id = s.id) AS episodio_count
      FROM series s
      WHERE s.titulo LIKE ?
      ORDER BY s.titulo;
      `,
      [`%${q}%`]
    );

    return new Response(JSON.stringify({ results }), {
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
