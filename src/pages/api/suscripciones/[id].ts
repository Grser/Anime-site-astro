import type { APIRoute } from 'astro';
import db from '../../../lib/db';

export const PUT: APIRoute = async ({ request, params }) => {
  const suscripcionId = Number(params.id);
  if (!suscripcionId) {
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

  const allowed = ['nombre', 'precio', 'descripcion', 'duracion'];
  const entries = Object.entries(payload).filter(([key]) => allowed.includes(key));

  if (!entries.length) {
    return new Response(JSON.stringify({ error: 'Sin cambios' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
  const values = entries.map(([key, value]) => {
    if (key === 'precio') return Number(value);
    const normalized = value?.toString().trim();
    return normalized === '' ? null : normalized;
  });

  try {
    const [result] = await db.query(
      `UPDATE suscripciones SET ${setClause} WHERE id = ?`,
      [...values, suscripcionId]
    );
    const affected = (result as any)?.affectedRows || 0;

    if (!affected) {
      return new Response(JSON.stringify({ error: 'Suscripción no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error actualizando suscripción', error);
    return new Response(JSON.stringify({ error: 'Error del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  const suscripcionId = Number(params.id);
  if (!suscripcionId) {
    return new Response(JSON.stringify({ error: 'ID inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const [result] = await db.query('DELETE FROM suscripciones WHERE id = ?', [suscripcionId]);
    const affected = (result as any)?.affectedRows || 0;

    if (!affected) {
      return new Response(JSON.stringify({ error: 'Suscripción no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error eliminando suscripción', error);
    return new Response(JSON.stringify({ error: 'Error del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
