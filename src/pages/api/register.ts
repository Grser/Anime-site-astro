import type { APIRoute } from "astro";
import db from "../../lib/db";
import bcrypt from "bcryptjs";
import { isTrustedEmailProvider, normalizeEmail, trustedEmailMessage } from "../../lib/email";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const { nickname, apodo, correo, password } = await request.json();
    const normalizedEmail = normalizeEmail(correo);
    console.log("📥 Registro recibido:", nickname, normalizedEmail);

    if (!nickname || !normalizedEmail || !password) {
      console.warn("⚠️ Datos incompletos");
      return new Response(JSON.stringify({ error: "Faltan datos obligatorios" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!isTrustedEmailProvider(normalizedEmail)) {
      return new Response(JSON.stringify({ error: trustedEmailMessage }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [exists] = await db.execute(
      "SELECT id FROM usuarios WHERE nickname = ? OR correo = ? LIMIT 1",
      [nickname, normalizedEmail]
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
    const [result] = await db.execute(
      `INSERT INTO usuarios (nickname, password, correo, apodo, imagen, suscripcion)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        nickname,
        hashed,
        normalizedEmail,
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
    // @ts-ignore - mysql2 typings
    const userId = (result as any).insertId;
    if (userId) {
      cookies.set("usuario_id", userId.toString(), {
        path: "/",
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    console.log("✅ Usuario registrado correctamente:", nickname);

    return new Response(JSON.stringify({ message: "Registro exitoso", requiresSubscription: true }), {
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
