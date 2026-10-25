import type { APIRoute } from 'astro';
import db from '../../lib/db';
import { getSessionUser } from '../../lib/session';
import { escapeHtml, inlineJson } from '../../lib/http';

const subscriptionRanks: Record<string, number> = { Gratis: 0, Super: 1, Estelar: 2 };

export const prerender = false;

export const GET: APIRoute = async ({ params, cookies }) => {
  const user = await getSessionUser(cookies);
  const userId = user?.id ?? null;
  const perfilId = user?.perfilId ?? 0;
  const episodioId = Number(params.episodio);

  if (!episodioId || !userId) {
    return new Response('Episodio o usuario no encontrado', { status: 404 });
  }

  // Trae episodio + temporada + serie en una sola query para armar el chrome y
  // calcular luego el "siguiente episodio" sin pedir dos veces.
  const [[ep]] = await db.query<any[]>(
    `SELECT e.id, e.titulo, e.video_url, e.numero_episodio, e.suscripcion_requerida,
            e.temporada_id, e.imagen_preview,
            t.numero_temporada, t.serie_id,
            s.titulo AS serie_titulo, s.slug AS serie_slug
       FROM episodios e
       JOIN temporadas t ON t.id = e.temporada_id
       JOIN series s ON s.id = t.serie_id
      WHERE e.id = ?
      LIMIT 1`,
    [episodioId]
  );

  if (!ep || !ep.video_url) {
    return new Response('Episodio no encontrado', { status: 404 });
  }

  // Este reproductor antiguo no comprobaba el plan, así que permitía ver episodios de pago.
  const requiredLevel = subscriptionRanks[ep.suscripcion_requerida || 'Gratis'] ?? 0;
  const userLevel = subscriptionRanks[user?.suscripcion || 'Gratis'] ?? 0;
  if (requiredLevel > 0 && userLevel < requiredLevel && !user?.esAdmin) {
    return new Response('Necesitas una suscripción para ver este episodio', { status: 403 });
  }

  const episodioNum = Number(ep.numero_episodio) || 1;
  const episodioStr = episodioNum.toString().padStart(2, '0');

  // Siguiente episodio: primero el que sigue en la misma temporada, si no, el
  // primer episodio de la siguiente temporada de la misma serie.
  const [nextRows] = await db.query<any[]>(
    `(
       SELECT e2.id, e2.titulo, e2.numero_episodio, e2.imagen_preview,
              t2.numero_temporada
         FROM episodios e2
         JOIN temporadas t2 ON t2.id = e2.temporada_id
        WHERE e2.temporada_id = ? AND e2.numero_episodio > ?
        ORDER BY e2.numero_episodio ASC
        LIMIT 1
     )
     UNION ALL
     (
       SELECT e2.id, e2.titulo, e2.numero_episodio, e2.imagen_preview,
              t2.numero_temporada
         FROM episodios e2
         JOIN temporadas t2 ON t2.id = e2.temporada_id
        WHERE t2.serie_id = ?
          AND t2.numero_temporada > ?
        ORDER BY t2.numero_temporada ASC, e2.numero_episodio ASC
        LIMIT 1
     )
     LIMIT 1`,
    [ep.temporada_id, episodioNum, ep.serie_id, ep.numero_temporada]
  );
  const nextEp = Array.isArray(nextRows) && nextRows[0] ? nextRows[0] : null;

  const normalizeBasePaths = (raw: string) => {
    const parsed = new URL(raw);
    const allowedVideoHosts = new Set(['videos.clawn.cat', 'videos.clawn.net']);
    if (!allowedVideoHosts.has(parsed.hostname)) {
      parsed.hostname = 'videos.clawn.net';
    }
    parsed.protocol = 'https:';

    const host = `${parsed.protocol}//${parsed.hostname}`;
    const path = parsed.pathname.replace(/\/+$/, '');

    const basePaths = new Set<string>();

    // Ruta sin el archivo final (compatibilidad con rutas antiguas)
    const withoutFile = path.replace(/\/(\d{1,2})(\.mp4|\.m3u8|\.mkv)$/i, '');
    basePaths.add(`${host}${withoutFile || '/'}`.replace(/\/$/, ''));

    // Ruta conservando la carpeta del episodio (ej. /ao-haru-ride/1/)
    const fileMatch = path.match(/^(.*)\/(\d{1,2})(\.[^.\/]+)$/);
    if (fileMatch) {
      const [, parentPath, episodeSegment] = fileMatch;
      basePaths.add(`${host}${parentPath}/${episodeSegment}`.replace(/\/$/, ''));
    }

    return Array.from(basePaths);
  };

  const basePaths = normalizeBasePaths(ep.video_url);

  const [historialRows] = perfilId
    ? await db.query(
        'SELECT progreso FROM historial WHERE perfil_id = ? AND episodio_id = ?',
        [perfilId, episodioId]
      )
    : [[]];
  const progresoGuardado = Number(Array.isArray(historialRows) && historialRows[0]?.progreso) || 0;

  const nextEpInfo = nextEp
    ? {
        id: Number(nextEp.id),
        titulo: String(nextEp.titulo || ''),
        numeroEpisodio: Number(nextEp.numero_episodio),
        numeroTemporada: Number(nextEp.numero_temporada),
        imagenPreview: nextEp.imagen_preview || null,
        url: `/player/${Number(nextEp.id)}`,
        seriePath: `/serie/${ep.serie_slug}/${Number(nextEp.id)}`,
      }
    : null;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
  <meta name="theme-color" content="#050507" />
  <title>${escapeHtml(ep.titulo)} · ${escapeHtml(ep.serie_titulo)}</title>
  <link href="https://vjs.zencdn.net/7.20.3/video-js.css" rel="stylesheet" />
  <script src="https://vjs.zencdn.net/7.20.3/video.min.js"></script>
  <style>
    :root {
      --accent: #a855f7;
      --accent-strong: #d946ef;
      --fg: #ededed;
      --fg-dim: rgba(237,237,239,.65);
      --fg-fade: rgba(237,237,239,.4);
      --bg: #050507;
      --surface: rgba(20,20,28,.78);
      --surface-raised: rgba(32,32,46,.92);
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg); height: 100%; overflow: hidden;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    body { display: grid; grid-template-rows: auto 1fr; }

    header.player-chrome {
      z-index: 20;
      display: flex; align-items: center; gap: 14px;
      padding: 10px max(14px, env(safe-area-inset-right)) 10px max(14px, env(safe-area-inset-left));
      background: linear-gradient(180deg, rgba(0,0,0,.75) 0%, rgba(0,0,0,0) 100%);
      position: absolute; top: 0; left: 0; right: 0;
      transition: opacity .25s ease;
    }
    header.player-chrome.hidden { opacity: 0; pointer-events: none; }
    .back-link {
      display: inline-flex; align-items: center; gap: 8px;
      color: var(--fg); text-decoration: none; font-weight: 600; font-size: 14px;
      padding: 8px 14px; border-radius: 999px;
      border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.4);
      backdrop-filter: blur(8px);
    }
    .back-link:hover { background: rgba(168,85,247,.18); border-color: rgba(217,70,239,.5); }
    .ep-crumb { min-width: 0; flex: 1; }
    .ep-crumb .serie { font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
      color: var(--fg-dim); display: block; }
    .ep-crumb .ep { font-size: 15px; font-weight: 700; margin-top: 2px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ep-crumb .se { color: var(--accent); margin-right: 8px; font-weight: 800; }

    main.player-stage {
      position: relative;
      background: #000;
      overflow: hidden;
      display: grid; place-items: stretch;
    }

    .loading-spinner {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      border: 6px solid rgba(255,255,255,.18);
      border-top: 6px solid var(--accent-strong);
      border-radius: 50%;
      width: 54px; height: 54px;
      animation: spin 1s linear infinite;
      z-index: 10;
      pointer-events: none;
    }
    @keyframes spin { to { transform: translate(-50%, -50%) rotate(360deg); } }

    .vjs-text-track-display div {
      color: #fff !important; background: transparent !important;
      text-shadow: 2px 2px 4px rgba(0,0,0,.75);
      font-size: 28px !important; font-weight: 700;
    }
    #video-player { width: 100%; height: 100%; background: #000; }

    /* Overlay de "siguiente episodio" */
    .next-overlay {
      position: absolute; right: 20px; bottom: 90px;
      width: min(340px, calc(100vw - 32px));
      padding: 14px;
      display: flex; gap: 12px; align-items: stretch;
      background: var(--surface); backdrop-filter: blur(14px);
      border: 1px solid rgba(217,70,239,.25);
      border-radius: 14px;
      box-shadow: 0 18px 50px rgba(0,0,0,.6);
      z-index: 15;
      transform: translateY(20px); opacity: 0; pointer-events: none;
      transition: opacity .25s, transform .25s;
    }
    .next-overlay.visible { opacity: 1; transform: translateY(0); pointer-events: auto; }
    .next-overlay img {
      width: 100px; height: 56px; object-fit: cover; border-radius: 8px;
      background: #111; flex-shrink: 0;
    }
    .next-overlay .meta { min-width: 0; flex: 1; }
    .next-overlay .label { font-size: 10px; letter-spacing: .15em; text-transform: uppercase;
      color: var(--accent); font-weight: 700; }
    .next-overlay .title { font-size: 14px; font-weight: 700; margin-top: 2px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .next-overlay .se { font-size: 12px; color: var(--fg-dim); margin-top: 2px; }
    .next-overlay .actions { display: flex; gap: 8px; margin-top: 10px; }
    .next-overlay button, .next-overlay a {
      flex: 1; padding: 8px 10px; font-size: 12px; font-weight: 700;
      border-radius: 8px; cursor: pointer; border: 0; text-decoration: none;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    }
    .next-overlay .play-next {
      background: linear-gradient(90deg, var(--accent) 0%, var(--accent-strong) 100%); color: #fff;
    }
    .next-overlay .play-next .countdown { font-variant-numeric: tabular-nums; opacity: .8; }
    .next-overlay .dismiss {
      background: rgba(255,255,255,.08); color: var(--fg-dim);
    }
    .next-overlay .dismiss:hover { background: rgba(255,255,255,.14); color: var(--fg); }

    /* Toast system (feedback para shortcuts y acciones) */
    .toast-stack {
      position: absolute; left: 20px; bottom: 90px;
      display: flex; flex-direction: column; gap: 8px;
      z-index: 15; pointer-events: none;
    }
    .toast {
      padding: 10px 14px; border-radius: 10px;
      background: rgba(0,0,0,.75); color: #fff; font-weight: 600; font-size: 13px;
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255,255,255,.08);
      animation: toast-in .25s ease forwards, toast-out .3s ease 1.4s forwards;
      max-width: 240px;
    }
    @keyframes toast-in { from { opacity: 0; transform: translateX(-20px); } }
    @keyframes toast-out { to { opacity: 0; transform: translateX(-20px); } }

    /* Custom buttons añadidos a la control bar */
    .vjs-crunchy-btn {
      cursor: pointer;
      background: transparent;
      border: 0;
      color: #fff;
      padding: 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .05em;
    }
    .vjs-crunchy-btn:hover { color: var(--accent); }
    .vjs-crunchy-btn.active { color: var(--accent-strong); }

    @media (max-width: 540px) {
      .next-overlay { right: 10px; left: 10px; bottom: 70px; width: auto; }
      .toast-stack { left: 10px; bottom: 70px; }
      header.player-chrome { padding: 8px; gap: 8px; }
      .back-link { padding: 6px 10px; font-size: 13px; }
    }
  </style>
</head>
<body>
  <header class="player-chrome" id="player-chrome">
    <a href="/serie/${escapeHtml(ep.serie_slug)}/${episodioId}" class="back-link" aria-label="Volver a la ficha">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 5l-7 7 7 7"/></svg>
      Volver
    </a>
    <div class="ep-crumb">
      <span class="serie">${escapeHtml(ep.serie_titulo)}</span>
      <div class="ep">
        <span class="se">T${Number(ep.numero_temporada) || 1} · E${episodioNum}</span>
        ${escapeHtml(ep.titulo)}
      </div>
    </div>
  </header>

  <main class="player-stage">
    <div class="loading-spinner" id="loading-spinner"></div>
    <video id="video-player" class="video-js vjs-default-skin" controls preload="auto" playsinline crossorigin="anonymous"></video>

    <div class="toast-stack" id="toast-stack" aria-live="polite"></div>

    <aside class="next-overlay" id="next-overlay" role="complementary" aria-label="Siguiente episodio">
      <!-- se rellena por JS si existe nextEpInfo -->
    </aside>
  </main>

  <script>
    const episodioId = ${episodioId};
    const perfilId = ${perfilId};
    const progresoGuardado = ${progresoGuardado};
    const nextEpInfo = ${inlineJson(nextEpInfo)};
    const availableBases = ${inlineJson(basePaths)};
    const episodio = "${episodioNum}";
    const episodioStr = "${episodioStr}";

    const videoElement = document.getElementById('video-player');
    const loadingSpinner = document.getElementById('loading-spinner');
    const chrome = document.getElementById('player-chrome');
    const nextOverlay = document.getElementById('next-overlay');
    const toastStack = document.getElementById('toast-stack');

    const player = videojs(videoElement, { autoplay: false, controls: true, playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2] });

    const proxify = (url) => '/api/proxy/video?url=' + encodeURIComponent(url);
    const appendToBase = (base, suffix) => base.replace(/\\/$/, '') + '/' + suffix;
    const buildFromBases = (suffixes) =>
      availableBases.flatMap((base) => suffixes.map((suffix) => appendToBase(base, suffix)));

    const hlsCandidates = buildFromBases([episodioStr + '.m3u8', episodio + '.m3u8']).map(proxify);
    const mp4Candidates = buildFromBases([episodioStr + '.mp4', episodio + '.mp4']).map(proxify);
    const mkvCandidates = buildFromBases([episodioStr + '.mkv', episodio + '.mkv']).map(proxify);
    const subtitlesCandidates = buildFromBases([
      episodioStr + '_subtitles_latam.vtt',
      episodio + '_subtitles_latam.vtt',
    ]).map(proxify);
    const altAudioCandidates = buildFromBases([
      episodioStr + '_audio_jpn.opus',
      episodio + '_audio_jpn.opus',
    ]).map(proxify);

    const pickFirstReachable = async (urls) => {
      for (const url of urls) {
        try {
          const res = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
          if (!res || res.ok || res.type === 'opaque') return url;
        } catch (e) { /* ignore and probe next */ }
      }
      return urls[0] || null;
    };

    // --- Toast feedback -----------------------------------------------------
    const showToast = (text) => {
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = text;
      toastStack.appendChild(el);
      // El keyframe toast-out dura 1.7s total; limpiamos justo después.
      setTimeout(() => el.remove(), 1800);
    };

    // --- Chrome auto-hide ---------------------------------------------------
    let hideChromeTimer = null;
    const scheduleHideChrome = () => {
      if (hideChromeTimer) clearTimeout(hideChromeTimer);
      chrome.classList.remove('hidden');
      hideChromeTimer = setTimeout(() => {
        if (!player.paused()) chrome.classList.add('hidden');
      }, 2500);
    };
    document.addEventListener('mousemove', scheduleHideChrome);
    document.addEventListener('touchstart', scheduleHideChrome, { passive: true });
    scheduleHideChrome();

    // --- Siguiente episodio overlay ----------------------------------------
    let nextCountdownTimer = null;
    let nextShown = false;
    const buildNextOverlay = () => {
      if (!nextEpInfo) return;
      const img = nextEpInfo.imagenPreview || '/avatar.jpeg';
      nextOverlay.innerHTML = \`
        <img src="\${img}" alt="" />
        <div class="meta">
          <span class="label">Siguiente episodio</span>
          <div class="title">\${nextEpInfo.titulo || ''}</div>
          <div class="se">T\${nextEpInfo.numeroTemporada} · E\${nextEpInfo.numeroEpisodio}</div>
          <div class="actions">
            <button type="button" class="play-next" data-next-play>
              Ver ahora <span class="countdown" id="next-countdown"></span>
            </button>
            <button type="button" class="dismiss" data-next-dismiss aria-label="Ocultar">×</button>
          </div>
        </div>\`;
      nextOverlay.querySelector('[data-next-play]').addEventListener('click', goNext);
      nextOverlay.querySelector('[data-next-dismiss]').addEventListener('click', hideNext);
    };
    const showNext = () => { if (nextEpInfo && !nextShown) { nextShown = true; nextOverlay.classList.add('visible'); } };
    const hideNext = () => { nextOverlay.classList.remove('visible'); nextShown = false; stopNextCountdown(); };
    const goNext = () => { if (nextEpInfo) window.location.href = nextEpInfo.url; };
    const startNextCountdown = (seconds) => {
      let left = seconds;
      const countdownEl = document.getElementById('next-countdown');
      if (countdownEl) countdownEl.textContent = \`(\${left}s)\`;
      nextCountdownTimer = setInterval(() => {
        left -= 1;
        if (countdownEl) countdownEl.textContent = left > 0 ? \`(\${left}s)\` : '';
        if (left <= 0) { stopNextCountdown(); goNext(); }
      }, 1000);
    };
    const stopNextCountdown = () => { if (nextCountdownTimer) { clearInterval(nextCountdownTimer); nextCountdownTimer = null; } };
    buildNextOverlay();

    // Si queda poco para terminar, muestra la card. Al terminar, inicia countdown.
    player.on('timeupdate', () => {
      if (!nextEpInfo) return;
      const duration = player.duration();
      const remaining = duration - player.currentTime();
      if (duration > 60 && remaining > 0 && remaining <= 25) showNext();
      else if (remaining > 30) hideNext();
    });
    player.on('ended', () => { if (nextEpInfo) { showNext(); startNextCountdown(10); } });

    // --- Botones custom en la control bar ----------------------------------
    const addCustomButton = (label, title, onClick, extraClass = '') => {
      const Component = videojs.getComponent('Button');
      class CustomBtn extends Component {
        constructor(parent, options) {
          super(parent, options);
          this.controlText(title);
          this.el().classList.add('vjs-crunchy-btn', extraClass);
          this.el().innerHTML = label;
        }
        handleClick() { onClick(this); }
      }
      videojs.registerComponent('CustomBtn_' + Math.random().toString(36).slice(2, 7), CustomBtn);
      const btn = new CustomBtn(player);
      player.controlBar.addChild(btn, {}, player.controlBar.children().length - 1);
      return btn;
    };

    player.ready(() => {
      // Marcar como visto
      addCustomButton('✓ Visto', 'Marcar episodio como visto', async () => {
        try {
          const r = await fetch('/api/player/mark-watched', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ episodeId: episodioId }),
          });
          if (r.ok) showToast('Marcado como visto');
          else showToast('No se pudo marcar');
        } catch { showToast('Error de red'); }
      });

      // Picture-in-picture (si el browser lo soporta)
      if (document.pictureInPictureEnabled && !videoElement.disablePictureInPicture) {
        addCustomButton('⧉ PiP', 'Picture-in-picture', async () => {
          try {
            if (document.pictureInPictureElement) await document.exitPictureInPicture();
            else await videoElement.requestPictureInPicture();
          } catch { showToast('PiP no disponible'); }
        });
      }

      // Siguiente episodio directo (si existe)
      if (nextEpInfo) {
        addCustomButton('Sig ⟶', 'Ir al siguiente episodio', goNext);
      }
    });

    // --- Carga de fuentes (HLS, MP4, MKV con fallback) --------------------
    const attachSubtitles = async () => {
      const subtitles = await pickFirstReachable(subtitlesCandidates);
      if (!subtitles) return;
      try {
        player.addRemoteTextTrack({
          kind: 'subtitles', src: subtitles, srclang: 'es',
          label: 'Español', default: true,
        }, false);
      } catch (e) { console.warn('No se pudieron cargar los subtítulos', e); }
    };

    const setupAltAudio = async () => {
      const audioUrl = await pickFirstReachable(altAudioCandidates);
      if (!audioUrl) return null;
      const altAudio = new Audio(audioUrl);
      altAudio.crossOrigin = 'anonymous';
      altAudio.preload = 'auto';
      let enabled = false;
      const syncTime = () => {
        if (Math.abs(altAudio.currentTime - player.currentTime()) > 0.5) {
          altAudio.currentTime = player.currentTime();
        }
      };
      const enableAlt = () => {
        enabled = true; player.muted(true);
        altAudio.volume = player.volume();
        altAudio.play().catch(() => {});
        showToast('Audio JP activo');
      };
      const disableAlt = () => {
        enabled = false; player.muted(false); altAudio.pause();
        showToast('Audio ES activo');
      };
      addCustomButton('🎌 JP', 'Alternar audio japonés', () => (enabled ? disableAlt() : enableAlt()));
      player.on('play', () => { if (enabled) altAudio.play().catch(() => {}); });
      player.on('pause', () => altAudio.pause());
      player.on('seeking', syncTime);
      player.on('seeked', syncTime);
      player.on('timeupdate', syncTime);
      player.on('volumechange', () => { altAudio.volume = player.volume(); });
      player.on('ratechange', () => { altAudio.playbackRate = player.playbackRate(); });
      player.on('ended', () => altAudio.pause());
      return { enableAlt, disableAlt };
    };

    const initializeSources = async () => {
      const hlsSource = await pickFirstReachable(hlsCandidates);
      const mp4Source = await pickFirstReachable(mp4Candidates);
      const mkvSource = await pickFirstReachable(mkvCandidates);
      const fallbacks = [
        hlsSource && { src: hlsSource, type: 'application/x-mpegURL' },
        mp4Source && videoElement.canPlayType('video/mp4') && { src: mp4Source, type: 'video/mp4' },
        mkvSource && videoElement.canPlayType('video/x-matroska') && { src: mkvSource, type: 'video/x-matroska' },
      ].filter(Boolean);
      let currentIndex = 0;
      const trySource = (index) => {
        const candidate = fallbacks[index];
        if (!candidate) { showToast('No se pudo cargar el video'); return false; }
        player.src(candidate);
        player.play().catch(() => {});
        return true;
      };
      player.on('error', () => {
        const current = player.currentSource();
        const nextIndex = currentIndex + 1;
        const hlsSupported = typeof Hls !== 'undefined' && Hls.isSupported();
        if (current?.type === 'application/x-mpegURL' && !videoElement.canPlayType('application/vnd.apple.mpegURL') && !hlsSupported) {
          currentIndex = nextIndex;
          trySource(currentIndex);
          return;
        }
        if (fallbacks[nextIndex]) { currentIndex = nextIndex; trySource(currentIndex); }
      });
      trySource(currentIndex);
    };

    initializeSources();
    attachSubtitles();
    setupAltAudio();

    // --- Resume y guardado de progreso ------------------------------------
    player.on('loadedmetadata', () => {
      if (progresoGuardado > 0 && progresoGuardado < player.duration() - 10) {
        player.currentTime(progresoGuardado);
      }
    });
    setInterval(() => {
      const progreso = Math.floor(player.currentTime());
      fetch('/api/player/progreso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodio_id: episodioId, progreso }),
      }).catch(() => {});
    }, 5000);
    player.on('ended', () => {
      fetch('/api/player/progreso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodio_id: episodioId, progreso: Math.floor(player.duration()), completado: 1 }),
      }).catch(() => {});
    });

    // --- Spinner visual ----------------------------------------------------
    player.on('loadstart', () => loadingSpinner.style.display = 'block');
    player.on('loadeddata', () => loadingSpinner.style.display = 'none');
    player.on('waiting', () => loadingSpinner.style.display = 'block');
    player.on('playing', () => loadingSpinner.style.display = 'none');

    // --- Shortcuts estilo Crunchyroll --------------------------------------
    const SEEK_STEP = 10;
    const VOL_STEP = 0.1;
    const captionsToggle = () => {
      const tracks = player.textTracks();
      if (!tracks || !tracks.length) { showToast('Sin subtítulos'); return; }
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        if (t.kind === 'subtitles' || t.kind === 'captions') {
          const willShow = t.mode !== 'showing';
          t.mode = willShow ? 'showing' : 'disabled';
          showToast(willShow ? 'Subtítulos ON' : 'Subtítulos OFF');
          return;
        }
      }
    };

    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName || '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key;
      switch (key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          if (player.paused()) { player.play(); showToast('▶ Play'); }
          else { player.pause(); showToast('⏸ Pausa'); }
          break;
        case 'ArrowRight':
        case 'l':
        case 'L': {
          e.preventDefault();
          const t = Math.min(player.duration() || 0, player.currentTime() + SEEK_STEP);
          player.currentTime(t);
          showToast('+' + SEEK_STEP + 's');
          break;
        }
        case 'ArrowLeft':
        case 'j':
        case 'J': {
          e.preventDefault();
          const t = Math.max(0, player.currentTime() - SEEK_STEP);
          player.currentTime(t);
          showToast('−' + SEEK_STEP + 's');
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const v = Math.min(1, player.volume() + VOL_STEP);
          player.volume(v); player.muted(false);
          showToast('Volumen ' + Math.round(v * 100) + '%');
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          const v = Math.max(0, player.volume() - VOL_STEP);
          player.volume(v);
          showToast('Volumen ' + Math.round(v * 100) + '%');
          break;
        }
        case 'm':
        case 'M': {
          e.preventDefault();
          const nowMuted = !player.muted();
          player.muted(nowMuted);
          showToast(nowMuted ? 'Silenciado' : 'Sonido ON');
          break;
        }
        case 'f':
        case 'F':
          e.preventDefault();
          if (player.isFullscreen()) {
            player.exitFullscreen();
          } else {
            player.requestFullscreen();
            showToast('Pantalla completa');
          }
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          captionsToggle();
          break;
        case 'p':
        case 'P':
          if (document.pictureInPictureEnabled && !videoElement.disablePictureInPicture) {
            e.preventDefault();
            if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
            else videoElement.requestPictureInPicture().catch(() => showToast('PiP no disponible'));
          }
          break;
        case 'n':
        case 'N':
          if (nextEpInfo) { e.preventDefault(); goNext(); }
          break;
        case 'Escape':
          if (player.isFullscreen()) player.exitFullscreen();
          else hideNext();
          break;
        default: {
          if (/^[0-9]$/.test(key)) {
            e.preventDefault();
            const pct = Number(key) / 10;
            const dur = player.duration() || 0;
            if (dur) {
              player.currentTime(dur * pct);
              showToast('Salto ' + (pct * 100).toFixed(0) + '%');
            }
          } else if (key === '>' || key === '.') {
            e.preventDefault();
            const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
            const idx = Math.min(rates.length - 1, rates.indexOf(player.playbackRate()) + 1);
            player.playbackRate(rates[idx]);
            showToast('Velocidad ' + rates[idx] + 'x');
          } else if (key === '<' || key === ',') {
            e.preventDefault();
            const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
            const idx = Math.max(0, rates.indexOf(player.playbackRate()) - 1);
            player.playbackRate(rates[idx]);
            showToast('Velocidad ' + rates[idx] + 'x');
          }
        }
      }
    });

    // --- Pausa muestra el chrome; play lo oculta tras inactividad ---------
    player.on('pause', () => { chrome.classList.remove('hidden'); if (hideChromeTimer) clearTimeout(hideChromeTimer); });
    player.on('play', () => { scheduleHideChrome(); });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
    }
  });
};
