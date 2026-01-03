import type { APIRoute } from 'astro';

const ALLOWED_HOSTS = new Set(['videos.clawn.cat']);

const resolveTarget = (rawUrl: string) => {
  try {
    const target = new URL(rawUrl);
    if (!ALLOWED_HOSTS.has(target.hostname)) return null;
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
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
};

const handleProxy = async (request: Request, method: 'GET' | 'HEAD') => {
  const targetParam = new URL(request.url).searchParams.get('url');

  if (!targetParam) {
    return new Response('Falta el parámetro url', { status: 400 });
  }

  const target = resolveTarget(targetParam);
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
