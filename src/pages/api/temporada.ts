import type { APIRoute } from 'astro';
import db from '../../lib/db';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { serie_id, numero_temporada, nombre_temporada } = await request.json();
    console.log("📩 Datos recibidos:", { serie_id, numero_temporada, nombre_temporada });

    if (!serie_id || !numero_temporada || !nombre_temporada) {
      console.warn("⚠️ Datos incompletos:", { serie_id, numero_temporada, nombre_temporada });
      return new Response(JSON.stringify({ error: 'Datos incompletos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const [resultado] = await db.query(
      `INSERT INTO temporadas (serie_id, numero_temporada, nombre_temporada)
       VALUES (?, ?, ?)`,
      [serie_id, numero_temporada, nombre_temporada]
    );

    console.log("✅ Temporada creada correctamente");

    return new Response(JSON.stringify({ success: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error("❌ Error interno al crear temporada:", err);
    return new Response(JSON.stringify({ error: 'Error del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
