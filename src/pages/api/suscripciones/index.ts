import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import { requireAdmin } from '../../../lib/admin';

export const POST: APIRoute = async ({ request, cookies }) => {
  const adminCheck = await requireAdmin(cookies);
  if (adminCheck instanceof Response) return adminCheck;

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
  const maxPerfilesRaw = Number(payload.max_perfiles ?? 1);
  const maxPerfiles = Number.isInteger(maxPerfilesRaw) && maxPerfilesRaw >= 1 && maxPerfilesRaw <= 5
    ? maxPerfilesRaw
    : 1;
  const periodoRaw = String(payload.periodo || '').toLowerCase();
  const periodo = periodoRaw.includes('anual') ? 'anual' : 'mensual';
  const precioAnualRaw = payload.precio_anual;
  const precioAnual = precioAnualRaw === '' || precioAnualRaw == null
    ? null
    : (Number.isFinite(Number(precioAnualRaw)) && Number(precioAnualRaw) >= 0 ? Number(precioAnualRaw) : null);
  if (!nombre || Number.isNaN(precio)) {
    return new Response(JSON.stringify({ error: 'Nombre y precio son obligatorios' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await db.query(
      `INSERT INTO suscripciones (nombre, precio, descripcion, max_perfiles, periodo, precio_anual)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nombre, precio, descripcion || null, maxPerfiles, periodo, precioAnual]
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
