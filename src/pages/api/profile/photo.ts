import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import { writeFile } from 'fs/promises';
import path from 'path';

export const POST: APIRoute = async ({ request, cookies }) => {
  const usuarioId = cookies.get('usuario_id')?.value;
  if (!usuarioId) return new Response(null, { status: 401 });

  const form = await request.formData();
  const file = form.get('photo') as File;
  if (!file) return new Response('No file', { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `user_${usuarioId}_${Date.now()}.png`;
  const filepath = path.resolve('./public/uploads', filename);
  await writeFile(filepath, buffer);

  await db.query(
    `UPDATE usuarios SET imagen = ? WHERE id = ?`,
    [`/uploads/${filename}`, usuarioId]
  );

  return new Response(JSON.stringify({ message: 'Foto actualizada' }), { status: 200 });
};
