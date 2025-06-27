import type { APIRoute } from "astro";
import { db } from "../../lib/db";
import bcrypt from "bcryptjs";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const { nickname, apodo, correo, password } = await request.json();

    if (!nickname || !correo || !password) {
      return new Response(JSON.stringify({ error: "Faltan datos obligatorios" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [exists] = await db.execute(
      "SELECT id FROM usuarios WHERE nickname = ? OR correo = ? LIMIT 1",
      [nickname, correo]
    );

    if (Array.isArray(exists) && exists.length > 0) {
      return new Response(JSON.stringify({ error: "Usuario o correo ya existe" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    await db.execute(
      `INSERT INTO usuarios (nickname, password, correo, apodo, imagen, suscripcion)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        nickname,
        hashed,
        correo,
        apodo || nickname,
        "http://190.208.112.55:5696/default.png",
        "Gratis"
      ]
    );

    cookies.set("session", nickname, {
      path: "/",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7,
    });

    return new Response(JSON.stringify({ message: "Registro exitoso" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Error interno en el servidor" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
