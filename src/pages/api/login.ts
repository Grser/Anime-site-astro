import type { APIRoute } from "astro";
import pool from "../../lib/db";
import bcrypt from "bcryptjs";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const { nickname, password } = await request.json();
    const identifier = (nickname || "").trim();
    console.log("🔐 Intento de login:", identifier);

    if (!identifier || !password) {
      return new Response(
        JSON.stringify({ error: "Faltan credenciales" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const [rows] = await pool.execute(
      "SELECT * FROM usuarios WHERE nickname = ? OR correo = ? LIMIT 1",
      [identifier, identifier]
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      console.warn("❌ Usuario no encontrado:", nickname);
      return new Response(
        JSON.stringify({ error: "Usuario no encontrado" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const user: any = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    console.log("🔍 Contraseña válida:", valid);
    if (!valid) {
      return new Response(
        JSON.stringify({ error: "Contraseña incorrecta" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Guardamos tanto nickname como id en cookies
    cookies.set("session", user.nickname, {
      path: "/",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7, // 7 días
      sameSite: "strict",
    });
    cookies.set("usuario_id", user.id.toString(), {
      path: "/",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7, // 7 días
      sameSite: "strict",
    });

    console.log("✅ Login exitoso para:", user.nickname);
    const requiresSubscription = !user.suscripcion || user.suscripcion === "Gratis";
    return new Response(
      JSON.stringify({
        message: "Login correcto",
        suscripcion: user.suscripcion || "Gratis",
        requiresSubscription
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("💥 Error en /api/login:", err);
    return new Response(
      JSON.stringify({ error: "Error interno" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
