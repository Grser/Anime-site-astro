import type { APIRoute } from "astro";
import db from "../../lib/db"; // Asegúrate que tu db.ts tenga `export default pool`
import bcrypt from "bcryptjs";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const { nickname, apodo, correo, password } = await request.json();
    console.log("📥 Registro recibido:", nickname, correo);

    if (!nickname || !correo || !password) {
      console.warn("⚠️ Datos incompletos");
      return new Response(JSON.stringify({ error: "Faltan datos obligatorios" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verificar si el usuario ya existe
    const [exists] = await db.execute(
      "SELECT id FROM usuarios WHERE nickname = ? OR correo = ? LIMIT 1",
      [nickname, correo]
    );

    if (Array.isArray(exists) && exists.length > 0) {
      console.warn("⚠️ Usuario o correo ya registrado:", nickname);
      return new Response(JSON.stringify({ error: "Usuario o correo ya existe" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Hashear contraseña
    const hashed = await bcrypt.hash(password, 10);

    // Insertar usuario nuevo (usando las columnas correctas de tu DB)
    await db.execute(
      `INSERT INTO usuarios (nickname, password, correo, apodo, imagen, suscripcion)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        nickname,
        hashed,
        correo,
        apodo || nickname,
        "http://190.208.112.55:5696/default.png", // imagen por defecto
        "Gratis"
      ]
    );

    // Iniciar sesión automática
    cookies.set("session", nickname, {
      path: "/",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7,
    });

    console.log("✅ Usuario registrado correctamente:", nickname);

    return new Response(JSON.stringify({ message: "Registro exitoso" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("💥 Error interno en /api/register:", err);
    return new Response(JSON.stringify({ error: "Error interno en el servidor" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
