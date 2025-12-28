// src/pages/api/episodios/[epId].ts
import type { APIRoute } from 'astro';
import type { RowDataPacket } from 'mysql2';
import db from '../../../lib/db';

interface Episodio extends RowDataPacket {
  id: number;
  titulo: string;
  numero_episodio: number;
  duracion: number;
  idioma: string;
  imagen_preview: string;
  temporada_id: number;
}

interface Temporada extends RowDataPacket {
  id: number;
}

export const GET: APIRoute = async ({ params }) => {
  try {
    const temporadaId = params.epId;

    if (!temporadaId || isNaN(Number(temporadaId))) {
      return new Response(JSON.stringify({ error: 'ID de temporada inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const [[temporada]] = await db.query<Temporada[]>(
      'SELECT id FROM temporadas WHERE id = ?',
      [temporadaId]
    );

    if (!temporada) {
      return new Response(JSON.stringify({ error: 'Temporada no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const [episodios] = await db.query<Episodio[]>(
      `SELECT
        id,
        titulo,
        numero_episodio,
        duracion,
        idioma,
        imagen_preview,
        temporada_id
      FROM episodios
      WHERE temporada_id = ?
      ORDER BY numero_episodio`,
      [temporadaId]
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: Array.isArray(episodios) ? episodios : []
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      }
    );
  } catch (error) {
    console.error('Error al obtener episodios:', error);

    return new Response(
      JSON.stringify({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};

export const PUT: APIRoute = async ({ params, request }) => {
  const epId = params.epId;
  const {
    numero_episodio,
    titulo,
    descripcion,
    duracion,
    video_url,
    fecha_estreno,
    idioma,
    imagen_preview,
    suscripcion_requerida
  } = await request.json();

  try {
    const [result] = await db.query<{
      affectedRows: number;
    }>(
      /* sql */ `
        UPDATE episodios SET
          numero_episodio        = ?,
          titulo                 = ?,
          descripcion            = ?,
          duracion               = ?,
          video_url              = ?,
          fecha_estreno          = ?,
          idioma                 = ?,
          imagen_preview         = ?,
          suscripcion_requerida  = ?
        WHERE id = ?
      `,
      [
        numero_episodio,
        titulo,
        descripcion || null,
        duracion || null,
        video_url || null,
        fecha_estreno || null,
        idioma || null,
        imagen_preview || null,
        suscripcion_requerida || 'Gratis',
        epId
      ]
    );

    if ((result as any).affectedRows === 0) {
      return new Response(JSON.stringify({ error: 'Episodio no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Error al actualizar episodio' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  const epId = Number(params.epId);

  if (!epId) {
    return new Response(JSON.stringify({ error: 'ID de episodio inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const [result] = await db.query('DELETE FROM episodios WHERE id = ?', [epId]);
    const affected = (result as any)?.affectedRows || 0;

    if (!affected) {
      return new Response(JSON.stringify({ error: 'Episodio no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error al eliminar episodio:', error);
    return new Response(JSON.stringify({ error: 'Error al eliminar episodio' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
