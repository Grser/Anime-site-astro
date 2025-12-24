import type { APIRoute } from 'astro';
import db from '../../lib/db';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const {
      titulo,
      descripcion,
      banner,
      icon,
      fecha_estreno,
      genero,
      carrucel_1
    } = body;

    // Validación mínima
    if (!titulo || !banner || !icon) {
      return new Response(JSON.stringify({ error: 'Campos requeridos faltantes' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const slug = titulo
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-]/g, '');

    await db.query(
      `INSERT INTO series 
        (titulo, descripcion, banner, icon, fecha_estreno, genero, carrucel_1, slug) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        titulo,
        descripcion || null,
        banner,
        icon,
        fecha_estreno || null,
        genero || null,
        carrucel_1 ?? 0,
        slug
      ]
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error("❌ Error al crear serie:", err);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
