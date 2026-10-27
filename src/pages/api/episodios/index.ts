// src/pages/api/episodios/index.ts
import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import { requireAdmin } from '../../../lib/admin';
import { notifySeriesFollowers } from '../../../lib/community';

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
      suscripcion_requerida,
      intro_start_seconds,
      intro_end_seconds,
      outro_start_seconds,
      outro_end_seconds
    } = await request.json();

    const normMarker = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = Math.floor(Number(v));
      return Number.isFinite(n) && n >= 0 ? n : null;
    };

    // Inserta en la tabla episodios
    const [result] = await db.query<{
      insertId: number;
    }>(
      /* sql */ `
        INSERT INTO episodios
          (temporada_id, numero_episodio, titulo, descripcion,
           duracion, video_url, fecha_estreno, idioma,
           imagen_preview, suscripcion_requerida,
           intro_start_seconds, intro_end_seconds,
           outro_start_seconds, outro_end_seconds)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        suscripcion_requerida || 'Gratis',
        normMarker(intro_start_seconds),
        normMarker(intro_end_seconds),
        normMarker(outro_start_seconds),
        normMarker(outro_end_seconds)
      ]
    );

    const episodeId = Number((result as any).insertId);
    try {
      const [[series]] = await db.query<any[]>(
        `SELECT s.id, s.slug, s.titulo
           FROM temporadas t
           JOIN series s ON s.id = t.serie_id
          WHERE t.id = ?
          LIMIT 1`,
        [temporada_id]
      );
      if (series) {
        const episodeName = String(titulo || `Episodio ${numero_episodio}`).trim();
        await notifySeriesFollowers({
          seriesId: Number(series.id),
          type: 'nuevo_episodio',
          title: `Nuevo episodio de ${series.titulo}`,
          message: `${episodeName} ya está disponible en ClawnVid.`,
          link: `/serie/${series.slug}/${episodeId}`,
          key: `episode-${episodeId}`,
        });
      }
    } catch (notificationError) {
      console.error('El episodio se creó, pero no se pudieron enviar sus notificaciones:', notificationError);
    }

    return new Response(
      JSON.stringify({ id: episodeId }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    console.error('Error al crear episodio:', e);
    return new Response(
      JSON.stringify({
        error: e?.sqlMessage || e?.message || 'Error al crear el episodio',
        code: e?.code || null,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
