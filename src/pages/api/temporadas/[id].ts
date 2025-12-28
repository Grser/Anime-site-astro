import type { APIRoute } from 'astro';
import db from '../../../lib/db';

export const PUT: APIRoute = async ({ request, params }) => {
  const tempId = Number(params.id);

  if (!tempId) {
    return new Response(JSON.stringify({ error: 'ID inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const numeroTemporada = Number(payload?.numero_temporada);
  const nombreTemporada = (payload?.nombre_temporada || '').toString().trim();

  if (!numeroTemporada || !nombreTemporada) {
    return new Response(JSON.stringify({ error: 'Datos incompletos' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const [result] = await db.query(
      'UPDATE temporadas SET numero_temporada=?, nombre_temporada=? WHERE id=?',
      [numeroTemporada, nombreTemporada, tempId]
    );

    const affected = (result as any)?.affectedRows || 0;
    if (!affected) {
      return new Response(JSON.stringify({ error: 'Temporada no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error al actualizar temporada', err);
    return new Response(JSON.stringify({ error: 'Error del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  const tempId = Number(params.id);

  if (!tempId) {
    return new Response(JSON.stringify({ error: 'ID inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await db.query('DELETE FROM episodios WHERE temporada_id=?', [tempId]);
    const [result] = await db.query('DELETE FROM temporadas WHERE id=?', [tempId]);
    const affected = (result as any)?.affectedRows || 0;

    if (!affected) {
      return new Response(JSON.stringify({ error: 'Temporada no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error al eliminar temporada', err);
    return new Response(JSON.stringify({ error: 'Error del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
