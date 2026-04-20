import type { APIRoute } from 'astro';
import db from '../../../lib/db';

type ProgressKey = `${number}:${number}`;

const progressThrottle = new Map<ProgressKey, { progreso: number; timestamp: number; completado: number }>();
const MIN_PROGRESS_INTERVAL_MS = 8000;
const MIN_PROGRESS_DELTA = 8;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();

    const userId = Number(body?.user_id);
    const episodioId = Number(body?.episodio_id);
    const progreso = Number(body?.progreso);
    const completado = Number(body?.completado ?? 0) ? 1 : 0;

    if (!userId || !episodioId || !Number.isFinite(progreso)) {
      return new Response(JSON.stringify({ error: 'Datos incompletos' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const safeProgress = Math.max(0, Math.floor(progreso));
    const now = Date.now();
    const throttleKey: ProgressKey = `${userId}:${episodioId}`;
    const lastEntry = progressThrottle.get(throttleKey);

    if (lastEntry && !completado) {
      const elapsed = now - lastEntry.timestamp;
      const progressDiff = Math.abs(safeProgress - lastEntry.progreso);
      if (elapsed < MIN_PROGRESS_INTERVAL_MS && progressDiff < MIN_PROGRESS_DELTA) {
        return new Response(JSON.stringify({ ok: true, throttled: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    await db.query(
      `INSERT INTO historial (usuario_id, episodio_id, progreso, completado)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE progreso = ?, completado = ?, fecha_actualizacion = NOW()`,
      [
        userId,
        episodioId,
        safeProgress,
        completado,
        safeProgress,
        completado,
      ]
    );

    progressThrottle.set(throttleKey, {
      progreso: safeProgress,
      timestamp: now,
      completado,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('❌ Error interno al guardar progreso:', err);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
