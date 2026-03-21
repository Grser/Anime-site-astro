import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import { writeFile } from 'fs/promises';
import { buildUserUploadPaths, ensureUserUploadDir } from '../../../utils/uploads';

function getExtensionFromFile(file: File) {
  const extFromName = file.name?.split('.').pop()?.toLowerCase();
  if (extFromName && /^[a-z0-9]{2,5}$/.test(extFromName)) return extFromName;

  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';

  return 'png';
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const usuarioId = cookies.get('usuario_id')?.value;
  if (!usuarioId) return new Response(null, { status: 401 });

  const form = await request.formData();
  const file = form.get('photo') as File;
  if (!file) return new Response('No file', { status: 400 });

  const extension = getExtensionFromFile(file);
  const filename = `profile_${Date.now()}.${extension}`;

  await ensureUserUploadDir(usuarioId, 'profile');
  const { filePath, publicPath } = buildUserUploadPaths(usuarioId, 'profile', filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  await db.query(
    `UPDATE usuarios SET imagen = ? WHERE id = ?`,
    [publicPath, usuarioId]
  );

  return new Response(JSON.stringify({ message: 'Foto actualizada', path: publicPath }), { status: 200 });
};
