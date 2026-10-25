import type { APIRoute } from 'astro';
import { getSessionUser, setSessionProfile } from '../../../../lib/session';
import { json } from '../../../../lib/http';

const parseId = (raw: string | undefined) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export const POST: APIRoute = async ({ cookies, params, request }) => {
  const user = await getSessionUser(cookies);
  if (!user) return json({ error: 'No autenticado' }, 401);

  const perfilId = parseId(params.id);
  if (!perfilId) return json({ error: 'Perfil inválido' }, 400);

  const ok = await setSessionProfile(cookies, user.id, perfilId, request);
  if (!ok) return json({ error: 'Perfil no encontrado' }, 404);

  return json({ ok: true, perfilId });
};
