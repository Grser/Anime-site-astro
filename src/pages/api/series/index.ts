import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import fs from 'fs/promises';
import path from 'path';

const DEFAULT_BANNER = 'http://181.74.89.24:5696/ClawnVid/img/anime/newicons/no_wp.jpg';
const API_KEY = process.env.KITSU_API_KEY || 'IrvECAcgihh9VeAR8BH3F_RmpFrjU0y-gZdw1ZA8JWI';
const KITSU_DIR = path.join(process.cwd(), 'public', 'kitsuImages');

function sanitizeSlug(raw: string, translation?: string) {
  const clean = (raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);

  const suffix = translation && ['raw', 'dubbed'].includes(translation) ? `-${translation}` : '';
  return (clean || 'serie') + suffix;
}

function getExtension(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('.');
    if (parts.length > 1) return parts.pop() as string;
  } catch {
    // ignore
  }
  return 'jpg';
}

async function saveRemoteImage(url: string, filename: string) {
  const ext = getExtension(url);
  const filePath = path.join(KITSU_DIR, `${filename}.${ext}`);

  await fs.mkdir(KITSU_DIR, { recursive: true });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo descargar la imagen: ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return `/kitsuImages/${filename}.${ext}`;
}

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let payload: Record<string, any>;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const {
    key,
    id,
    titulo,
    descripcion,
    cover,
    banner,
    fecha_estreno,
    genero,
    clasificacion_edad,
    translation,
    slug,
    icon,
    idioma,
    popularidad,
    carrucel_1,
    destacado_reciente,
  } = payload;

  if (key !== API_KEY) {
    return new Response(JSON.stringify({ error: 'API key inválida' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!titulo || !descripcion) {
    return new Response(JSON.stringify({ error: 'Faltan título o descripción' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!cover && !icon) {
    return new Response(JSON.stringify({ error: 'Falta la imagen de portada (cover/icon)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const translationLower = (translation || idioma || 'subbed').toLowerCase();
  if (!['subbed', 'dubbed', 'raw'].includes(translationLower)) {
    return new Response(JSON.stringify({ error: 'translation debe ser subbed, dubbed o raw' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const normalizedSlug = sanitizeSlug(slug || titulo, translationLower);
  const coverUrl = cover || icon;
  const bannerUrl = banner?.trim() ? banner : DEFAULT_BANNER;

  try {
    const [coverPublicPath, bannerPublicPath] = await Promise.all([
      saveRemoteImage(coverUrl, `cover_${id || normalizedSlug}`),
      saveRemoteImage(bannerUrl, `banner_${id || normalizedSlug}`),
    ]);

    const [result] = await db.execute(
      `INSERT INTO series (slug, titulo, descripcion, banner, icon, fecha_estreno, genero, clasificacion_edad, idioma, popularidad, carrucel_1, destacado_reciente)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` as string,
      [
        normalizedSlug,
        titulo,
        descripcion,
        bannerPublicPath,
        coverPublicPath,
        fecha_estreno || null,
        genero || null,
        clasificacion_edad || null,
        translationLower,
        popularidad ?? 0,
        carrucel_1 ?? 0,
        destacado_reciente ?? 0,
      ]
    );

    const insertId = (result as any)?.insertId;
    return new Response(
      JSON.stringify({
        message: 'success',
        id: insertId,
        slug: normalizedSlug,
        banner: bannerPublicPath,
        icon: coverPublicPath,
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creando serie desde Kitsu', error);
    return new Response(
      JSON.stringify({ error: 'Error interno al crear la serie' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
