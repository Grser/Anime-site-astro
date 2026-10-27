import type { APIRoute } from 'astro';

// Proxy acotado para tráilers de hosts donde el embed oficial o la URL directa
// no sirven para un <video>. Hoy sólo cubre Google Drive (que fuerza su propio
// player con marca y menú de descarga en /file/d/<id>/preview).
//
// La URL se pasa en ?src=<URL firmada por el admin> y rechazamos cualquier host
// que no esté en el allowlist, para no convertir el endpoint en un open-proxy.

const ALLOWED_HOSTS = new Set([
  'drive.google.com',
  'drive.usercontent.google.com',
  'docs.google.com',
]);

const resolveDriveStreamUrl = (raw: string): string | null => {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (!ALLOWED_HOSTS.has(host)) return null;

    // Formatos de share de Drive aceptados:
    //   https://drive.google.com/file/d/<id>/view
    //   https://drive.google.com/open?id=<id>
    //   https://drive.google.com/uc?export=download&id=<id>
    //   https://drive.usercontent.google.com/download?id=<id>...
    let id = '';
    const m = url.pathname.match(/\/file\/d\/([^/]+)/);
    if (m) id = m[1];
    if (!id) id = url.searchParams.get('id') || '';
    if (!id) return null;

    // usercontent.google.com es el host CDN moderno; confirm=t salta el
    // interstitial de "virus scan" en archivos > 25MB.
    const streamUrl = new URL('https://drive.usercontent.google.com/download');
    streamUrl.searchParams.set('id', id);
    streamUrl.searchParams.set('export', 'download');
    streamUrl.searchParams.set('authuser', '0');
    streamUrl.searchParams.set('confirm', 't');
    return streamUrl.toString();
  } catch {
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
  // Un UA de browser evita que Drive responda con la página de virus-scan.
  headers.set('user-agent', 'Mozilla/5.0 (ClawnVid trailer proxy)');
  return headers;
};

const buildResponse = (upstream: Response) => {
  const headers = new Headers(upstream.headers);
  for (const name of ['set-cookie', 'connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-disposition']) {
    headers.delete(name);
  }
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  // Cache corto para que el browser no re-pida en cada seek
  if (!headers.has('cache-control')) headers.set('cache-control', 'public, max-age=300');
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
};

const handleProxy = async (request: Request, method: 'GET' | 'HEAD') => {
  const src = new URL(request.url).searchParams.get('src');
  if (!src) return new Response('Falta el parámetro src', { status: 400 });

  const streamUrl = resolveDriveStreamUrl(src);
  if (!streamUrl) return new Response('Host de tráiler no soportado', { status: 400 });

  try {
    const upstream = await fetch(streamUrl, {
      method,
      headers: forwardHeaders(request),
      redirect: 'follow',
    });

    // Si Drive devuelve HTML, es la página de virus-scan o un error.
    const upstreamType = upstream.headers.get('content-type') || '';
    if (upstreamType.includes('text/html')) {
      return new Response('El tráiler no se pudo recuperar (archivo demasiado grande o restringido)', {
        status: 502,
      });
    }

    return buildResponse(upstream);
  } catch (error) {
    console.error('Error en proxy de tráiler:', error);
    return new Response('No se pudo obtener el tráiler', { status: 502 });
  }
};

export const prerender = false;
export const GET: APIRoute = async ({ request }) => handleProxy(request, 'GET');
export const HEAD: APIRoute = async ({ request }) => handleProxy(request, 'HEAD');
