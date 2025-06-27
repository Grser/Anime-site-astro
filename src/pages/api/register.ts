import type { APIRoute } from "astro";
import { db } from "../../lib/db";
import bcrypt from "bcrypt";

export const POST: APIRoute = async ({ request, cookies }) => {
  const data = await request.json();
  const { nickname, correo, password, apodo } = data;

  if (!nickname || !correo || !password) {
    return new Response(JSON.stringify({ error: "Faltan campos obligatorios" }), { status: 400 });
  }

  // Verificar si el usuario ya existe
  const [exists] = await db.execute(
    "SELECT id FROM usuarios WHERE nickname = ? OR correo = ? LIMIT 1",
    [nickname, correo]
  );

  if (Array.isArray(exists) && exists.length > 0) {
    return new Response(JSON.stringify({ error: "Usuario o correo ya existe" }), { status: 409 });
  }

  // Hashear la contraseña
  const hash = await bcrypt.hash(password, 10);

  // Crear usuario
  await db.execute(
    `INSERT INTO usuarios (nickname, password, correo, apodo, imagen, suscripcion)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      nickname,
      hash,
      correo,
      apodo || nickname,
      "http://190.208.112.55:5696/default.png",
      "Gratis"
    ]
  );

  // Iniciar sesión automática
  cookies.set("session", nickname, {
    path: "/",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 7 días
  });

  return new Response(JSON.stringify({ message: "Registro exitoso" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
