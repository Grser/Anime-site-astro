import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import { requireAdmin } from '../../../lib/admin';

export const POST: APIRoute = async ({ request, cookies }) => {
  const adminCheck = await requireAdmin(cookies);
  if (adminCheck instanceof Response) return adminCheck;

  let payload: any;

  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const serieId = Number(payload?.serie_id);
  const numeroTemporada = Number(payload?.numero_temporada);
  const nombreTemporada = (payload?.nombre_temporada || '').toString().trim();

  if (!serieId || !numeroTemporada || !nombreTemporada) {
    return new Response(JSON.stringify({ error: 'Datos incompletos' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await db.query(
      `INSERT INTO temporadas (serie_id, numero_temporada, nombre_temporada) VALUES (?, ?, ?)`,
      [serieId, numeroTemporada, nombreTemporada]
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error al crear temporada', err);
    return new Response(JSON.stringify({ error: 'Error del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
