// src/pages/api/episodios/[epId].ts
import type { APIRoute } from 'astro';
import db from '../../../../lib/db';
import { requireAdmin } from '../../../../lib/admin';

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  const adminCheck = await requireAdmin(cookies);
  if (adminCheck instanceof Response) return adminCheck;

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
