import type { APIRoute } from "astro";
import db from '../../lib/db';

export const GET: APIRoute = async ({ cookies }) => {
  const session = cookies.get("session")?.value;

  if (!session) {
    return new Response(JSON.stringify(null), { status: 200 });
  }

  const [rows] = await db.execute(
    "SELECT nickname, apodo, imagen, es_admin, suscripcion FROM usuarios WHERE nickname = ? LIMIT 1",
    [session]
  );

  if (Array.isArray(rows) && rows.length > 0) {
    return new Response(JSON.stringify(rows[0]), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });
  }

  return new Response(JSON.stringify(null), { status: 200 });
};
