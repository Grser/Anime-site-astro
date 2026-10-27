import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import { getSessionUserId } from '../../../lib/session';
import { issueInvoice, normalizePeriodo, type PeriodoSuscripcion } from '../../../lib/billing';

// Checkout "simulado": emite factura y activa la suscripción al confirmar.
// Cuando se integre una pasarela real (Stripe/MP/PayPal), el flujo cambia a:
//   1) Crear PaymentIntent, 2) Devolver client_secret, 3) Al webhook de pago
//   confirmado, llamar a issueInvoice(). Hoy saltamos directo al paso 3 para
//   que el usuario vea el ciclo completo (factura + suscripcion_hasta) sin
//   dependencias externas.

const resolvePrice = (plan: any, periodo: PeriodoSuscripcion): number => {
  if (periodo === 'anual' && plan.precio_anual != null) {
    const anual = Number(plan.precio_anual);
    if (Number.isFinite(anual) && anual >= 0) return anual;
  }
  const base = Number(plan.precio ?? 0);
  if (!Number.isFinite(base) || base < 0) return 0;
  // Anual sin precio dedicado: fallback = 12 meses con 20% de descuento.
  if (periodo === 'anual') return Number((base * 12 * 0.8).toFixed(2));
  return base;
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const usuarioId = await getSessionUserId(cookies);
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

  const periodo = normalizePeriodo(payload?.periodo);

  try {
    const [planRows] = await db.query<any[]>(
      'SELECT id, nombre, precio, precio_anual, periodo FROM suscripciones WHERE id = ? LIMIT 1',
      [suscripcionId],
    );
    const suscripcion = Array.isArray(planRows) ? planRows[0] : null;
    if (!suscripcion?.nombre) {
      return new Response(JSON.stringify({ error: 'Suscripción no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const monto = resolvePrice(suscripcion, periodo);
    const factura = await issueInvoice({
      usuarioId,
      planNombre: String(suscripcion.nombre),
      periodo,
      monto,
      metodoPago: typeof payload?.metodoPago === 'string' ? payload.metodoPago : 'simulado',
    });

    return new Response(
      JSON.stringify({
        success: true,
        activated: true,
        plan: suscripcion.nombre,
        periodo,
        monto,
        factura: {
          id: factura.id,
          numero: factura.numeroFactura,
          periodoInicio: factura.periodoInicio.toISOString(),
          periodoFin: factura.periodoFin.toISOString(),
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error en checkout de suscripción', error);
    return new Response(JSON.stringify({ error: 'Error del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
