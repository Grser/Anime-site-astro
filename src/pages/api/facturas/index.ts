import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import { getSessionUserId } from '../../../lib/session';

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  const usuarioId = await getSessionUserId(cookies);
  if (!usuarioId) {
    return new Response(JSON.stringify({ error: 'No autenticado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const [rows] = await db.query<any[]>(
      `SELECT id, suscripcion_nombre, periodo, monto, moneda, metodo_pago,
              estado, periodo_inicio, periodo_fin, numero_factura, created_at
         FROM facturas
        WHERE usuario_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 100`,
      [usuarioId],
    );

    return new Response(
      JSON.stringify({
        facturas: (rows as any[]).map((row) => ({
          id: Number(row.id),
          numero: String(row.numero_factura),
          plan: String(row.suscripcion_nombre),
          periodo: String(row.periodo),
          monto: Number(row.monto),
          moneda: String(row.moneda || 'USD'),
          metodoPago: row.metodo_pago ? String(row.metodo_pago) : null,
          estado: String(row.estado),
          periodoInicio: row.periodo_inicio,
          periodoFin: row.periodo_fin,
          createdAt: row.created_at,
        })),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Error listando facturas', error);
    return new Response(JSON.stringify({ error: 'Error del servidor', facturas: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
