import { signVideoUrl } from './video-token';

// Genera, dado el video_url del episodio, la lista exacta de URLs que el
// browser debería probar en orden. Antes esta lógica vivía en el cliente, lo
// cual exponía la URL real del CDN. Ahora corre server-side y lo que viaja al
// cliente son tokens firmados opacos.

const ALLOWED_VIDEO_HOSTS = new Set(['videos.clawn.cat', 'videos.clawn.net']);

const normalizeTargetUrl = (raw: string): URL | null => {
  try {
    const url = new URL(raw);
    if (!ALLOWED_VIDEO_HOSTS.has(url.hostname)) {
      url.hostname = 'videos.clawn.net';
    }
    url.protocol = 'https:';
    return url;
  } catch {
    return null;
  }
};

const deriveBasePaths = (parsed: URL): string[] => {
  const path = parsed.pathname.replace(/\/+$/, '');
  const basePaths = new Set<string>();

  // Ruta sin el archivo final (/serie/s1/1.mp4 → /serie/s1)
  const withoutFile = path.replace(/\/(\d+)(?:\.m3u8|\.mp4|\.mkv)$/i, '');
  basePaths.add(withoutFile || '/');

  // Mantiene la carpeta del episodio (/serie/s1/1/1.mp4 → /serie/s1/1)
  const fileMatch = path.match(/^(.*)\/(\d+)(\.[^.\/]+)$/);
  if (fileMatch) {
    const [, parentPath, episodeSegment] = fileMatch;
    basePaths.add(`${parentPath}/${episodeSegment}`);
  }

  // Si ya era un directorio, también.
  if (!path.match(/\.\w+$/)) {
    basePaths.add(path || '/');
  }

  return Array.from(basePaths);
};

const episodeSegmentFromPath = (path: string): { raw: string; padded: string } => {
  const match = path.match(/\/(\d+)(?:\.[^.\/]+)?$/);
  if (!match) {
    const dirMatch = path.match(/\/(\d+)\/?$/);
    const raw = dirMatch?.[1] || '';
    return { raw, padded: raw.padStart(2, '0') };
  }
  return { raw: match[1], padded: match[1].padStart(2, '0') };
};

export interface VideoSources {
  /** Tokens firmados ordenados por preferencia (HLS, luego MP4, luego MKV). */
  video: Array<{ token: string; type: string }>;
  /** Tokens firmados de posibles .vtt de subtítulos. */
  subtitles: string[];
  /** Token del póster/preview (una imagen del CDN permitido). */
  poster: string | null;
}

/**
 * Dado el video_url guardado en DB, deriva todas las URLs candidatas (variantes
 * de extensión y nombres `1.mp4` / `01.mp4` / `1.m3u8` …) y las firma. El
 * cliente nunca ve la URL cruda del CDN.
 */
export const buildVideoSources = (rawVideoUrl: string, posterUrl?: string | null): VideoSources => {
  const empty: VideoSources = { video: [], subtitles: [], poster: null };
  if (!rawVideoUrl) return empty;

  const parsed = normalizeTargetUrl(rawVideoUrl);
  if (!parsed) return empty;

  const { raw: episodeNum, padded } = episodeSegmentFromPath(parsed.pathname);
  const basePaths = deriveBasePaths(parsed);

  const addCandidates = (
    extensions: string[],
    mime: string,
    out: Array<{ token: string; type: string }>,
  ) => {
    const seen = new Set<string>();
    for (const base of basePaths) {
      for (const ext of extensions) {
        for (const name of [episodeNum, padded]) {
          if (!name) continue;
          const absolute = `${parsed.origin}${base}/${name}.${ext}`;
          if (seen.has(absolute)) continue;
          seen.add(absolute);
          out.push({ token: signVideoUrl(absolute), type: mime });
        }
      }
    }
  };

  const video: Array<{ token: string; type: string }> = [];
  // Si video_url ya apuntaba a un archivo concreto, respétalo primero.
  if (/\.(m3u8|mp4|mkv)$/i.test(parsed.pathname)) {
    const ext = parsed.pathname.split('.').pop()?.toLowerCase() || '';
    const mime =
      ext === 'm3u8' ? 'application/x-mpegURL' :
      ext === 'mp4'  ? 'video/mp4' :
      ext === 'mkv'  ? 'video/x-matroska' : '';
    if (mime) video.push({ token: signVideoUrl(parsed.toString()), type: mime });
  }

  addCandidates(['m3u8'], 'application/x-mpegURL', video);
  addCandidates(['mp4'], 'video/mp4', video);
  addCandidates(['mkv'], 'video/x-matroska', video);

  const subtitles: string[] = [];
  const subSeen = new Set<string>();
  const addSub = (absolute: string) => {
    if (subSeen.has(absolute)) return;
    subSeen.add(absolute);
    subtitles.push(signVideoUrl(absolute));
  };
  for (const base of basePaths) {
    for (const name of [episodeNum, padded]) {
      if (!name) continue;
      addSub(`${parsed.origin}${base}/${name}_subtitles_latam.vtt`);
      addSub(`${parsed.origin}${base}/${name}.vtt`);
    }
  }

  const poster = (() => {
    if (!posterUrl) return null;
    try {
      const p = new URL(posterUrl);
      if (!ALLOWED_VIDEO_HOSTS.has(p.hostname)) return posterUrl; // ya es externo, se usa tal cual
      return signVideoUrl(p.toString());
    } catch {
      return posterUrl; // relativa (/avatar.jpeg), se usa tal cual
    }
  })();

  return { video, subtitles, poster };
};
