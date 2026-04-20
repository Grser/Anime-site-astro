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
    const [planRows] = await db.query(
      'SELECT id, nombre, precio, descripcion FROM suscripciones WHERE id = ? LIMIT 1',
      [suscripcionId],
    );
    const suscripcion = Array.isArray(planRows) ? planRows[0] : null;

    if (!suscripcion?.nombre) {
      return new Response(JSON.stringify({ error: 'Suscripción no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const [userRows] = await db.query('SELECT suscripcion FROM usuarios WHERE id = ? LIMIT 1', [usuarioId]);
    const user = Array.isArray(userRows) ? userRows[0] : null;

    if (!user) {
      return new Response(JSON.stringify({ error: 'Usuario no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (user.suscripcion === suscripcion.nombre) {
      return new Response(
        JSON.stringify({
          success: true,
          alreadyActive: true,
          message: `Ya tienes activo el plan ${suscripcion.nombre}.`,
          plan: suscripcion,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        pendingPayment: true,
        message: `Seleccionaste ${suscripcion.nombre}. La activación quedará pendiente hasta confirmar el método de pago.`,
        plan: suscripcion,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error preparando checkout de suscripción', error);
    return new Response(JSON.stringify({ error: 'Error del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
