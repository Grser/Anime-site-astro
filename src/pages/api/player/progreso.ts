import type { APIRoute } from 'astro';
import db from '../../../lib/db'; // ✅ Importación corregida

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    console.log("📥 Datos recibidos:", body);

    const { user_id, episodio_id, progreso, completado } = body;

    if (!user_id || !episodio_id || typeof progreso !== 'number') {
      console.warn("❌ Datos inválidos recibidos:", body);
      return new Response(JSON.stringify({ error: 'Datos incompletos' }), { status: 400 });
    }

    await db.query(
      `INSERT INTO historial (usuario_id, episodio_id, progreso, completado)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE progreso = ?, completado = ?, fecha_actualizacion = NOW()`,
      [
        user_id,
        episodio_id,
        progreso,
        completado ?? 0,
        progreso,
        completado ?? 0,
      ]
    );

    console.log(`✅ Progreso guardado correctamente para user ${user_id}, episodio ${episodio_id}`);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error("❌ Error interno al guardar progreso:", err);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
