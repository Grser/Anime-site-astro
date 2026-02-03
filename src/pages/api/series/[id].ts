import type { APIRoute } from 'astro';
import db from '../../../lib/db';

export const PUT: APIRoute = async ({ request, params }) => {
  const serieId = Number(params.id);
  if (!serieId) {
    return new Response(JSON.stringify({ error: 'ID inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: Record<string, any>;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const allowed = [
    'titulo',
    'descripcion',
    'slug',
    'banner',
    'icon',
    'fecha_estreno',
    'genero',
    'clasificacion_edad',
    'idioma',
    'popularidad',
    'carrucel_1',
    'destacado_reciente',
  ];

  const entries = Object.entries(payload).filter(([key]) => allowed.includes(key));
  if (!entries.length) {
    return new Response(JSON.stringify({ error: 'Sin cambios' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
  const values = entries.map(([key, value]) => {
    if (['popularidad', 'carrucel_1', 'destacado_reciente'].includes(key)) {
      return Number(value) ? Number(value) : 0;
    }
    const normalized = value?.toString().trim();
    return normalized === '' ? null : normalized;
  });

  try {
    const [result] = await db.query(
      `UPDATE series SET ${setClause} WHERE id = ?`,
      [...values, serieId]
    );
    const affected = (result as any)?.affectedRows || 0;

    if (!affected) {
      return new Response(JSON.stringify({ error: 'Serie no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error actualizando serie', error);
    return new Response(JSON.stringify({ error: 'Error del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  const serieId = Number(params.id);
  if (!serieId) {
    return new Response(JSON.stringify({ error: 'ID inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await db.query(
      `DELETE e FROM episodios e
       JOIN temporadas t ON e.temporada_id = t.id
       WHERE t.serie_id = ?`,
      [serieId]
    );
    await db.query('DELETE FROM temporadas WHERE serie_id = ?', [serieId]);
    const [result] = await db.query('DELETE FROM series WHERE id = ?', [serieId]);
    const affected = (result as any)?.affectedRows || 0;

    if (!affected) {
      return new Response(JSON.stringify({ error: 'Serie no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error eliminando serie', error);
    return new Response(JSON.stringify({ error: 'Error del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
