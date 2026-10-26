/**
 * Convierte una URL de tráiler en el embed URL correcto para iframe, o devuelve
 * null si debe reproducirse con el elemento <video> nativo (archivo directo).
 *
 * Plataformas con embed:
 *  - YouTube (youtube.com, youtu.be, youtube-nocookie)
 *  - Vimeo (vimeo.com, player.vimeo.com)
 *  - Dailymotion (dailymotion.com, dai.ly)
 *  - archive.org (details -> embed)
 *  - Google Drive (file/d/<id>/view -> preview iframe)
 *  - Dropbox (?dl=0 -> ?raw=1)
 *
 * Para enlaces directos .mp4/.webm/.ogv/.mov/.mkv/.m3u8 devolvemos null para que
 * el caller use <video src>. Mismo tratamiento para URLs locales (/api/media/...).
 */

export type TrailerKind = 'iframe' | 'video' | 'invalid';
export type TrailerResolved = {
  kind: TrailerKind;
  /** URL final para iframe.src o video.src según kind. Null si invalid. */
  src: string | null;
};

const DIRECT_VIDEO_EXT = /\.(mp4|webm|ogv|mov|mkv|m3u8)(\?|$)/i;

export const resolveTrailer = (raw: unknown): TrailerResolved => {
  const source = typeof raw === 'string' ? raw.trim() : '';
  if (!source) return { kind: 'invalid', src: null };

  // Enlace local al propio servidor (ej. /api/media/trailers/xxx.mp4). Siempre
  // va por <video> nativo, no por iframe.
  if (source.startsWith('/')) return { kind: 'video', src: source };

  let url: URL;
  try {
    url = new URL(source, 'https://clawnvid.local');
  } catch {
    return { kind: 'invalid', src: null };
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  // --- YouTube ---
  if (host === 'youtu.be' || host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    let id = '';
    if (host === 'youtu.be') {
      id = url.pathname.split('/').filter(Boolean)[0] || '';
    } else {
      id = url.searchParams.get('v') || '';
      if (!id) {
        const match = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?]+)/);
        if (match) id = match[1];
      }
    }
    if (id) {
      return {
        kind: 'iframe',
        src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1`,
      };
    }
  }

  // --- Vimeo ---
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = url.pathname.match(/\/(?:video\/)?(\d+)/)?.[1];
    if (id) return { kind: 'iframe', src: `https://player.vimeo.com/video/${id}?autoplay=1&muted=1&title=0&byline=0&portrait=0` };
  }

  // --- Dailymotion ---
  if (host === 'dailymotion.com' || host === 'dai.ly') {
    let id = '';
    if (host === 'dai.ly') id = url.pathname.split('/').filter(Boolean)[0] || '';
    else {
      const match = url.pathname.match(/^\/(?:video|embed\/video)\/([^/?]+)/);
      if (match) id = match[1];
    }
    if (id) return { kind: 'iframe', src: `https://www.dailymotion.com/embed/video/${encodeURIComponent(id)}?autoplay=1&mute=1` };
  }

  // --- archive.org ---
  if (host === 'archive.org') {
    const match = url.pathname.match(/^\/details\/([^/?]+)/);
    if (match) return { kind: 'iframe', src: `https://archive.org/embed/${encodeURIComponent(match[1])}?autoplay=1` };
    if (url.pathname.startsWith('/embed/')) return { kind: 'iframe', src: source };
  }

  // --- Google Drive (archivo compartido con "cualquiera con el enlace") ---
  if (host === 'drive.google.com') {
    const match = url.pathname.match(/\/file\/d\/([^/]+)/);
    if (match) return { kind: 'iframe', src: `https://drive.google.com/file/d/${encodeURIComponent(match[1])}/preview` };
  }

  // --- Dropbox (link para compartir -> raw) ---
  if (host === 'dropbox.com' || host === 'www.dropbox.com') {
    const direct = source.replace(/[?&]dl=0/, '?raw=1').replace(/[?&]dl=1/, '?raw=1');
    const finalUrl = direct.includes('raw=1') ? direct : (direct + (direct.includes('?') ? '&' : '?') + 'raw=1');
    return { kind: 'video', src: finalUrl };
  }

  // --- Enlaces directos de video por extensión ---
  if (DIRECT_VIDEO_EXT.test(url.pathname) || DIRECT_VIDEO_EXT.test(source)) {
    return { kind: 'video', src: source };
  }

  // Si no matcheó plataforma conocida, intentamos como <video> igual (puede ser
  // un endpoint directo sin extensión visible); el browser dirá si no puede.
  return { kind: 'video', src: source };
};
