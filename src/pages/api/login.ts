import type { APIRoute } from "astro";
import { db } from "../../lib/db";

export const POST: APIRoute = async ({ request, cookies }) => {
  const { nickname, password } = await request.json();

  const [rows] = await db.execute(
    "SELECT * FROM usuarios WHERE nickname = ? LIMIT 1",
    [nickname]
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return new Response(JSON.stringify({ error: "Usuario no encontrado" }), { status: 404 });
  }

  const user = rows[0] as any;

  // 👇 Aquí deberías usar bcrypt para verificar el password
  const isValid = password === "1234"; // REEMPLAZA CON BCRYPT

  if (!isValid) {
    return new Response(JSON.stringify({ error: "Contraseña incorrecta" }), { status: 401 });
  }

  cookies.set("session", user.nickname, {
    path: "/",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 7 días
  });

  return new Response(JSON.stringify({ message: "Login correcto" }));
};
