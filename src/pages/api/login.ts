import type { APIRoute } from "astro";
import pool from "../../lib/db"; // Usamos el pool que exportaste
import bcrypt from "bcryptjs";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const { nickname, password } = await request.json();
    console.log("🔐 Intento de login:", nickname);

    if (!nickname || !password) {
      return new Response(JSON.stringify({ error: "Faltan credenciales" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM usuarios WHERE nickname = ? LIMIT 1",
      [nickname]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      console.warn("❌ Usuario no encontrado:", nickname);
      return new Response(JSON.stringify({ error: "Usuario no encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const user: any = rows[0];

    if (!user.password) {
      console.error("❗ El usuario no tiene campo 'password'");
      return new Response(JSON.stringify({ error: "Error en datos del usuario" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const valid = await bcrypt.compare(password, user.password);
    console.log("🔍 Contraseña válida:", valid);

    if (!valid) {
      return new Response(JSON.stringify({ error: "Contraseña incorrecta" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    cookies.set("session", user.nickname, {
      path: "/",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7, // 7 días
    });

    console.log("✅ Login exitoso para:", user.nickname);

    return new Response(JSON.stringify({ message: "Login correcto" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("💥 Error en /api/login:", err);
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
