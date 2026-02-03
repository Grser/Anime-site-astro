import type { APIRoute } from 'astro';
import db from '../../../lib/db';

export const POST: APIRoute = async ({ request, cookies }) => {
  const usuarioId = Number(cookies.get('usuario_id')?.value);

  if (!usuarioId) {
    return new Response(JSON.stringify({ error: 'Debes iniciar sesión' }), {
      status: 401,
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

  const suscripcionId = Number(payload?.suscripcionId);
  if (!suscripcionId) {
    return new Response(JSON.stringify({ error: 'Suscripción inválida' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const [rows] = await db.query('SELECT nombre FROM suscripciones WHERE id = ? LIMIT 1', [
      suscripcionId,
    ]);
    const suscripcion = Array.isArray(rows) ? rows[0] : null;

    if (!suscripcion?.nombre) {
      return new Response(JSON.stringify({ error: 'Suscripción no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await db.query('UPDATE usuarios SET suscripcion = ? WHERE id = ?', [
      suscripcion.nombre,
      usuarioId,
    ]);

    return new Response(
      JSON.stringify({ success: true, message: `Plan ${suscripcion.nombre} activado.` }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error activando suscripción', error);
    return new Response(JSON.stringify({ error: 'Error del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
