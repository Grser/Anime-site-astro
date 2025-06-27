import type { APIRoute } from 'astro';
import { pool } from '../../lib/db';

export const GET: APIRoute = async () => {
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout DB')), 80000);
    });

    const queryPromise = pool.query(`
      SELECT id, titulo, descripcion, banner, icon
      FROM series
      WHERE carrucel_1 = 1
      ORDER BY popularidad DESC
      LIMIT 5
    `);

    const [rows] = await Promise.race([queryPromise, timeoutPromise]);

    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('API error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
