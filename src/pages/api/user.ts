import type { APIRoute } from "astro";
import { getSessionUser } from "../../lib/session";

export const GET: APIRoute = async ({ cookies }) => {
  const user = await getSessionUser(cookies);
  const headers = { "Content-Type": "application/json", "Cache-Control": "private, no-store" };

  if (!user) {
    return new Response(JSON.stringify(null), { status: 200, headers });
  }

  return new Response(
    JSON.stringify({
      nickname: user.nickname,
      apodo: user.apodo,
      imagen: user.imagen,
      es_admin: user.esAdmin ? 1 : 0,
      suscripcion: user.suscripcion,
      region: user.region,
      perfilId: user.perfilId,
      perfilNombre: user.perfilNombre,
      perfilAvatar: user.perfilAvatar,
      perfilesCount: user.perfilesCount,
      esNino: user.esNino,
    }),
    { status: 200, headers }
  );
};
