import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import bcrypt from 'bcryptjs';

export const POST: APIRoute = async ({ request, cookies }) => {
  const usuarioId = cookies.get('usuario_id')?.value;
  if (!usuarioId) return new Response(null, { status: 401 });

  const { oldPassword, newPassword } = await request.json();

  const [[user]] = await db.query(
    `SELECT password FROM usuarios WHERE id = ?`,
    [usuarioId]
  );
  const match = await bcrypt.compare(oldPassword, user.password);
  if (!match) {
    return new Response(JSON.stringify({ error: 'Contraseña actual incorrecta' }), { status: 400 });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await db.query(`UPDATE usuarios SET password = ? WHERE id = ?`, [hash, usuarioId]);

  return new Response(JSON.stringify({ message: 'Contraseña cambiada' }), { status: 200 });
};
