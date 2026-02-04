import type { APIRoute } from "astro";
import bcrypt from "bcryptjs";
import db from "../../../lib/db";

const DEFAULT_AVATAR = "http://190.208.112.55:5696/default.png";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const { email, displayName } = await request.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "El correo de Twitter es obligatorio" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const [rows] = await db.execute(
      "SELECT id, nickname, suscripcion FROM usuarios WHERE correo = ? LIMIT 1",
      [email]
    );

    let nickname = displayName?.trim() || email.split("@")[0];
    if (!nickname) nickname = "usuarioTwitter";

    let userId: number;
    let requiresSubscription = true;
    if (Array.isArray(rows) && rows.length > 0) {
      userId = (rows[0] as any).id;
      nickname = (rows[0] as any).nickname;
      const currentPlan = (rows[0] as any).suscripcion || "Gratis";
      requiresSubscription = currentPlan === "Gratis";
    } else {
      const sanitized = nickname.replace(/[^a-zA-Z0-9_-]/g, "") || "twitter";
      let finalNickname = sanitized;

      const [nickRows] = await db.execute(
        "SELECT nickname FROM usuarios WHERE nickname = ?",
        [finalNickname]
      );
      if (Array.isArray(nickRows) && nickRows.length > 0) {
        finalNickname = `${sanitized}-${Math.floor(Math.random() * 10000)}`;
      }

      const randomSecret = await bcrypt.hash(`${email}-${Date.now()}`, 10);
      const [result] = await db.execute(
        `INSERT INTO usuarios (nickname, password, correo, apodo, imagen, suscripcion)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          finalNickname,
          randomSecret,
          email,
          displayName || finalNickname,
          DEFAULT_AVATAR,
          "Gratis",
        ]
      );

      // @ts-ignore - mysql2 typings
      userId = (result as any).insertId;
      nickname = finalNickname;
      requiresSubscription = true;
    }

    cookies.set("session", nickname, {
      path: "/",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7,
      sameSite: "strict",
    });
    cookies.set("usuario_id", userId.toString(), {
      path: "/",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7,
      sameSite: "strict",
    });

    return new Response(
      JSON.stringify({
        message: "Login con Twitter exitoso",
        requiresSubscription
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("💥 Error en /api/auth/twitter:", err);
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
