import type { APIRoute } from "astro";
import bcrypt from "bcryptjs";
import db from "../../lib/db";

export const POST: APIRoute = async ({ request }) => {
  try {
    const { correo, newPassword } = await request.json();

    if (!correo || !newPassword) {
      return new Response(
        JSON.stringify({ error: "Correo y nueva contraseña son obligatorios" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const [rows] = await db.execute(
      "SELECT id, nickname FROM usuarios WHERE correo = ? LIMIT 1",
      [correo]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(
        JSON.stringify({ error: "No encontramos una cuenta con ese correo" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.execute("UPDATE usuarios SET password = ? WHERE correo = ?", [
      hashed,
      correo,
    ]);

    return new Response(
      JSON.stringify({ message: "Contraseña actualizada, ya puedes iniciar sesión" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("💥 Error en /api/recover-password:", err);
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
