import type { APIRoute } from "astro";
import bcrypt from "bcryptjs";
import db from "../../lib/db";
import { isTrustedEmailProvider, normalizeEmail, trustedEmailMessage } from "../../lib/email";
import { setSessionCookie } from "../../lib/session";
import { getClientIp, hitRateLimit, tooManyRequests } from "../../lib/rate-limit";
import { json, NICKNAME_PATTERN, validatePassword } from "../../lib/http";

const DEFAULT_AVATAR = "/avatar.jpeg";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Solicitud inválida" }, 400);
    }

    const nickname = String(body.nickname || "").trim();
    const apodo = String(body.apodo || "").trim().replace(/\s+/g, " ").slice(0, 60);
    const normalizedEmail = normalizeEmail(body.correo);
    const password = body.password;

    if (!nickname || !normalizedEmail || !password) {
      return json({ error: "Faltan datos obligatorios" }, 400);
    }

    if (!NICKNAME_PATTERN.test(nickname)) {
      return json(
        { error: "El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo." },
        400
      );
    }

    if (normalizedEmail.length > 190 || !EMAIL_PATTERN.test(normalizedEmail)) {
      return json({ error: "El correo no es válido" }, 400);
    }

    if (!isTrustedEmailProvider(normalizedEmail)) {
      return json({ error: trustedEmailMessage }, 400);
    }

    const passwordError = validatePassword(password);
    if (passwordError) return json({ error: passwordError }, 400);

    const wait = hitRateLimit(`register:${getClientIp(request, clientAddress)}`, 5, 60 * 60_000);
    if (wait) return tooManyRequests(wait);

    const [exists] = await db.execute(
      "SELECT id FROM usuarios WHERE nickname = ? OR correo = ? LIMIT 1",
      [nickname, normalizedEmail]
    );

    if (Array.isArray(exists) && exists.length > 0) {
      return json({ error: "Usuario o correo ya existe" }, 409);
    }

    const hashed = await bcrypt.hash(password as string, 10);

    let result: any;
    try {
      [result] = await db.execute(
        `INSERT INTO usuarios (nickname, password, correo, apodo, imagen, suscripcion)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [nickname, hashed, normalizedEmail, apodo || nickname, DEFAULT_AVATAR, "Gratis"]
      );
    } catch (error: any) {
      // Dos registros simultáneos con el mismo usuario/correo.
      if (error?.code === "ER_DUP_ENTRY") return json({ error: "Usuario o correo ya existe" }, 409);
      throw error;
    }

    const userId = Number(result?.insertId);
    if (userId) {
      // Crear el perfil principal del nuevo usuario para que las APIs per-perfil
      // (favoritos, historial, likes, notificaciones) tengan dónde escribir desde el
      // primer login. Si falla (p. ej. tabla perfiles aún no migrada), seguimos sin
      // bloquear el registro: la sesión degrada al perfil implícito del usuario.
      try {
        await db.execute(
          `INSERT INTO perfiles (usuario_id, nombre, avatar, es_principal, orden)
           VALUES (?, ?, ?, 1, 0)`,
          [userId, apodo || nickname, DEFAULT_AVATAR]
        );
      } catch (err) {
        console.warn("[register] No se pudo crear el perfil principal:", (err as Error).message);
      }
      setSessionCookie(cookies, { id: userId, password: hashed }, request);
    }

    return json({ message: "Registro exitoso", requiresSubscription: true });
  } catch (err) {
    console.error("Error interno en /api/register:", err);
    return json({ error: "Error interno en el servidor" }, 500);
  }
};
