import type { APIRoute } from 'astro';
import { verifyVideoToken } from '../../../lib/video-token';

// Hosts a los que el proxy puede ir (defensa en profundidad: aunque alguien
// consiga firmar un token con otra URL, igual se bloquea).
const ALLOWED_HOSTS = new Set(['videos.clawn.cat', 'videos.clawn.net']);

const resolveTarget = (rawUrl: string) => {
  try {
    const target = new URL(rawUrl);
    if (!ALLOWED_HOSTS.has(target.hostname)) return null;
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return null;
    if (target.username || target.password || (target.port && !['80', '443'].includes(target.port))) return null;
    return target;
  } catch (error) {
    console.error('URL de proxy inválida', error);
    return null;
  }
};

const forwardHeaders = (request: Request) => {
  const headers = new Headers();
  const range = request.headers.get('range');
  const ifRange = request.headers.get('if-range');
  const ifModifiedSince = request.headers.get('if-modified-since');

  if (range) headers.set('range', range);
  if (ifRange) headers.set('if-range', ifRange);
  if (ifModifiedSince) headers.set('if-modified-since', ifModifiedSince);

  return headers;
};

const buildProxiedResponse = (upstream: Response) => {
  const headers = new Headers(upstream.headers);
  for (const name of ['set-cookie', 'connection', 'keep-alive', 'transfer-encoding', 'content-encoding']) {
    headers.delete(name);
  }
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  // Que ni el browser ni intermediarios revelen el origin real al cliente.
  headers.delete('x-cache');
  headers.delete('x-served-by');
  headers.delete('server');
  headers.delete('via');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
};

const handleProxy = async (request: Request, method: 'GET' | 'HEAD') => {
  const search = new URL(request.url).searchParams;
  const token = search.get('t');

  if (!token) {
    // El cliente nunca debería pedir sin token. Antes aceptábamos ?url=<raw>,
    // ahora rechazamos para que no se vea de dónde viene el video.
    return new Response('Token requerido', { status: 400 });
  }

  const verified = verifyVideoToken(token);
  if (!verified) {
    return new Response('Token inválido o expirado', { status: 401 });
  }

  const target = resolveTarget(verified.url);
  if (!target) {
    return new Response('Dominio no permitido', { status: 400 });
  }

  try {
    const upstream = await fetch(target.toString(), {
      method,
      headers: forwardHeaders(request),
    });

    return buildProxiedResponse(upstream);
  } catch (error) {
    console.error('Error al solicitar el recurso externo', error);
    return new Response('No se pudo obtener el recurso solicitado', { status: 502 });
  }
};

export const prerender = false;

export const GET: APIRoute = async ({ request }) => handleProxy(request, 'GET');
export const HEAD: APIRoute = async ({ request }) => handleProxy(request, 'HEAD');
