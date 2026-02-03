import type { APIRoute } from 'astro';
import db from '../../../lib/db';

export const POST: APIRoute = async ({ request }) => {
  let payload: Record<string, any>;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const nombre = (payload.nombre || '').toString().trim();
  const precio = Number(payload.precio);
  const descripcion = (payload.descripcion || '').toString().trim();
  const duracion = (payload.duracion || '').toString().trim() || null;

  if (!nombre || Number.isNaN(precio)) {
    return new Response(JSON.stringify({ error: 'Nombre y precio son obligatorios' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await db.query(
      `INSERT INTO suscripciones (nombre, precio, descripcion, duracion)
       VALUES (?, ?, ?, ?)`,
      [nombre, precio, descripcion || null, duracion]
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creando suscripción', error);
    return new Response(JSON.stringify({ error: 'Error del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
