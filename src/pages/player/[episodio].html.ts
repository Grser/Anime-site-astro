import type { APIRoute } from 'astro';
import db from '../../lib/db';
import { parse } from 'cookie';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const cookies = parse(request.headers.get('cookie') || '');
  const userId = cookies.usuario_id ? Number(cookies.usuario_id) : null;
  const episodioId = Number(params.episodio);

  if (!episodioId || !userId) {
    return new Response('Episodio o usuario no encontrado', { status: 404 });
  }

  const [[ep]] = await db.query(
    `SELECT id, titulo, video_url, numero_episodio FROM episodios WHERE id = ? LIMIT 1`,
    [episodioId]
  );

  if (!ep) {
    return new Response('Episodio no encontrado', { status: 404 });
  }

  const episodioNum = ep.numero_episodio;
  const episodioStr = episodioNum.toString().padStart(2, '0');

  const normalizeBasePath = (raw: string) => {
    const path = new URL(raw).pathname;

    // quitamos el archivo final y normalizamos el host
    const withoutFile = path.replace(/\/(\d{1,2})(\.mp4|\.m3u8)?$/, '');
    return `https://videos.clawn.cat${withoutFile.replace(/\/$/, '')}`;
  };

  const basePath = normalizeBasePath(ep.video_url);

  const [historialRows] = await db.query(
    'SELECT progreso FROM historial WHERE usuario_id = ? AND episodio_id = ?',
    [userId, episodioId]
  );
  const progresoGuardado = Array.isArray(historialRows) && historialRows[0]?.progreso || 0;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${ep.titulo}</title>
  <link href="https://vjs.zencdn.net/7.20.3/video-js.css" rel="stylesheet" />
  <script src="https://vjs.zencdn.net/7.20.3/video.min.js"></script>
  <style>
    body {
      margin: 0; background: #1c1c1c;
      display: flex; justify-content: center; align-items: center;
      height: 100vh; overflow: hidden;
    }
    .loading-spinner {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      border: 8px solid rgba(255,255,255,0.3);
      border-top: 8px solid #800080;
      border-radius: 50%;
      width: 50px; height: 50px;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      0% { transform: translate(-50%, -50%) rotate(0deg); }
      100% { transform: translate(-50%, -50%) rotate(360deg); }
    }
    .vjs-text-track-display div {
      color: white !important;
      background: transparent !important;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.7);
      font-size: 30px !important;
      font-weight: bold;
    }
    #video-player {
      width: 100%; height: 100%;
      max-width: 100%; max-height: 100%;
      background: #000;
    }
  </style>
</head>
<body>
  <div class="loading-spinner" id="loading-spinner"></div>
  <video id="video-player" class="video-js vjs-default-skin" controls preload="auto"></video>

  <script>
    const userId = ${userId};
    const episodioId = ${episodioId};
    const progresoGuardado = ${progresoGuardado};

    const videoElement = document.getElementById('video-player');
    const loadingSpinner = document.getElementById('loading-spinner');
    const player = videojs(videoElement, { autoplay: false, controls: true });

    const basePath = "${basePath}";
    const episodio = "${episodioNum}";
    const episodioStr = "${episodioStr}";

    const hlsCandidates = [
      `${basePath}/${episodioStr}.m3u8`,
      `${basePath}/${episodio}.m3u8`
    ];

    const mp4Candidates = [
      `${basePath}/${episodioStr}.mp4`,
      `${basePath}/${episodio}.mp4`
    ];

    const subtitlesCandidates = [
      `${basePath}/${episodioStr}_subtitles_latam.vtt`,
      `${basePath}/${episodio}_subtitles_latam.vtt`,
    ];

    const altAudioCandidates = [
      `${basePath}/${episodioStr}_audio_jpn.opus`,
      `${basePath}/${episodio}_audio_jpn.opus`
    ];

    const pickFirstReachable = async (urls) => {
      for (const url of urls) {
        try {
          const res = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
          if (!res || res.ok || res.type === 'opaque') return url;
        } catch (e) {
          console.warn('No se pudo validar', url, e);
        }
      }
      return urls[0] || null;
    };

    const attachSubtitles = async () => {
      const subtitles = await pickFirstReachable(subtitlesCandidates);
      if (!subtitles) return;

      try {
        const res = await fetch(subtitles, { method: 'HEAD', mode: 'no-cors' });
        if (!res || res.ok || res.type === 'opaque') {
          player.addRemoteTextTrack({
            kind: 'subtitles',
            src: subtitles,
            srclang: 'es',
            label: 'Español',
            default: true,
          }, false);
        }
      } catch (e) {
        console.warn('No se pudieron cargar los subtítulos', e);
      }
    };

    const setupAltAudio = async () => {
      const audioUrl = await pickFirstReachable(altAudioCandidates);
      if (!audioUrl) return null;

      const altAudio = new Audio(audioUrl);
      altAudio.crossOrigin = 'anonymous';
      altAudio.preload = 'auto';

      let enabled = false;

      const toggleButton = document.createElement('button');
      toggleButton.textContent = 'Audio JP';
      toggleButton.style.position = 'absolute';
      toggleButton.style.bottom = '20px';
      toggleButton.style.right = '20px';
      toggleButton.style.padding = '10px 12px';
      toggleButton.style.background = '#800080';
      toggleButton.style.color = '#fff';
      toggleButton.style.border = 'none';
      toggleButton.style.borderRadius = '8px';
      toggleButton.style.cursor = 'pointer';
      toggleButton.style.opacity = '0.8';
      toggleButton.style.zIndex = '5';

      const syncTime = () => {
        if (Math.abs(altAudio.currentTime - player.currentTime()) > 0.5) {
          altAudio.currentTime = player.currentTime();
        }
      };

      const enableAlt = () => {
        enabled = true;
        player.muted(true);
        altAudio.volume = player.volume();
        altAudio.play().catch(() => {});
        toggleButton.style.opacity = '1';
      };

      const disableAlt = () => {
        enabled = false;
        player.muted(false);
        altAudio.pause();
        toggleButton.style.opacity = '0.6';
      };

      toggleButton.addEventListener('click', () => {
        enabled ? disableAlt() : enableAlt();
      });

      player.on('play', () => { if (enabled) altAudio.play().catch(() => {}); });
      player.on('pause', () => altAudio.pause());
      player.on('seeking', syncTime);
      player.on('seeked', syncTime);
      player.on('timeupdate', syncTime);
      player.on('volumechange', () => { altAudio.volume = player.volume(); });
      player.on('ratechange', () => { altAudio.playbackRate = player.playbackRate(); });
      player.on('ended', () => altAudio.pause());

      videoElement.parentElement?.appendChild(toggleButton);
      return { enableAlt, disableAlt };
    };

    const initializeSources = async () => {
      const hlsSource = await pickFirstReachable(hlsCandidates);
      const mp4Source = await pickFirstReachable(mp4Candidates);

      if (hlsSource) {
        player.src({ src: hlsSource, type: 'application/x-mpegURL' });
      } else if (mp4Source) {
        player.src({ src: mp4Source, type: 'video/mp4' });
      } else {
        alert('No se pudo cargar el video.');
      }

      // fallback extra: si el HLS falla en reproducción, usar mp4
      player.on('error', () => {
        const current = player.currentSource();
        if (current?.type === 'application/x-mpegURL' && mp4Source) {
          player.src({ src: mp4Source, type: 'video/mp4' });
          player.play().catch(() => {});
        }
      });
    };

    initializeSources();
    attachSubtitles();
    setupAltAudio();

    // Progreso al cargar
    player.on("loadedmetadata", () => {
      if (progresoGuardado > 0 && progresoGuardado < player.duration() - 10) {
        player.currentTime(progresoGuardado);
      }
    });

    // Guardar cada 5s
    setInterval(() => {
      const progreso = Math.floor(player.currentTime());
      fetch('/api/player/progreso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          episodio_id: episodioId,
          progreso
        })
      });
    }, 5000);

    // Marcar completado
    player.on("ended", () => {
      fetch('/api/player/progreso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          episodio_id: episodioId,
          progreso: Math.floor(player.duration()),
          completado: 1
        })
      });
    });

    // Spinner visual
    player.on("loadstart", () => loadingSpinner.style.display = "block");
    player.on("loadeddata", () => loadingSpinner.style.display = "none");

    // 🎮 Atajos de teclado
    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName || '';
      if (['INPUT', 'TEXTAREA'].includes(tag)) return;

      const vol = player.volume();

      switch (e.key) {
        case ' ':
          e.preventDefault();
          player.paused() ? player.play() : player.pause();
          break;
        case 'ArrowRight':
          e.preventDefault();
          player.currentTime(Math.min(player.duration(), player.currentTime() + 5));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          player.currentTime(Math.max(0, player.currentTime() - 5));
          break;
        case 'ArrowUp':
          e.preventDefault();
          player.volume(Math.min(1, vol + 0.1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          player.volume(Math.max(0, vol - 0.1));
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          player.muted(!player.muted());
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          if (!document.fullscreenElement) {
            player.requestFullscreen();
          } else {
            document.exitFullscreen().catch(() => {});
          }
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
          break;
      }
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
    }
  });
};
