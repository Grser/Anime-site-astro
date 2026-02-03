import type { APIRoute } from 'astro';
import db from '../../../lib/db';

export const PUT: APIRoute = async ({ request, params }) => {
  const usuarioId = Number(params.id);
  if (!usuarioId) {
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

  const allowed = ['apodo', 'correo', 'suscripcion', 'es_admin', 'baneado'];
  const entries = Object.entries(payload).filter(([key]) => allowed.includes(key));

  if (!entries.length) {
    return new Response(JSON.stringify({ error: 'Sin cambios' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
  const values = entries.map(([key, value]) => {
    if (['es_admin', 'baneado'].includes(key)) {
      return Number(value) ? 1 : 0;
    }
    const normalized = value?.toString().trim();
    return normalized === '' ? null : normalized;
  });

  try {
    const [result] = await db.query(
      `UPDATE usuarios SET ${setClause} WHERE id = ?`,
      [...values, usuarioId]
    );
    const affected = (result as any)?.affectedRows || 0;

    if (!affected) {
      return new Response(JSON.stringify({ error: 'Usuario no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error actualizando usuario', error);
    return new Response(JSON.stringify({ error: 'Error del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  const usuarioId = Number(params.id);
  if (!usuarioId) {
    return new Response(JSON.stringify({ error: 'ID inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const [result] = await db.query('DELETE FROM usuarios WHERE id = ?', [usuarioId]);
    const affected = (result as any)?.affectedRows || 0;

    if (!affected) {
      return new Response(JSON.stringify({ error: 'Usuario no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error eliminando usuario', error);
    return new Response(JSON.stringify({ error: 'Error del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
