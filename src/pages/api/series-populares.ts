import type { APIRoute } from 'astro';
import { pool } from '../../lib/db';

export const GET: APIRoute = async () => {
  try {
    const [rows] = await pool.query(`
      SELECT id, titulo, banner, icon
      FROM series
      ORDER BY popularidad DESC
      LIMIT 8
    `);

    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'DB error', details: error.message }), { status: 500 });
  }
};
