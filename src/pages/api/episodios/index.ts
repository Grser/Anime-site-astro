// src/pages/api/episodios/index.ts
import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import { requireAdmin } from '../../../lib/admin';

export const POST: APIRoute = async ({ request, cookies }) => {
  const adminCheck = await requireAdmin(cookies);
  if (adminCheck instanceof Response) return adminCheck;

  try {
    const {
      temporada_id,
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

    // Inserta en la tabla episodios
    const [result] = await db.query<{
      insertId: number;
    }>(
      /* sql */ `
        INSERT INTO episodios
          (temporada_id, numero_episodio, titulo, descripcion,
           duracion, video_url, fecha_estreno, idioma,
           imagen_preview, suscripcion_requerida)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        temporada_id,
        numero_episodio,
        titulo,
        descripcion || null,
        duracion || null,
        video_url || null,
        fecha_estreno || null,
        idioma || null,
        imagen_preview || null,
        suscripcion_requerida || 'Gratis'
      ]
    );

    return new Response(
      JSON.stringify({ id: (result as any).insertId }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ error: 'Error al crear el episodio' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
