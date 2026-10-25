import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import { getSessionUser } from '../../../lib/session';

type ProgressKey = `${number}:${number}`;

const progressThrottle = new Map<ProgressKey, { progreso: number; timestamp: number; completado: number }>();
const MIN_PROGRESS_INTERVAL_MS = 8000;
const MIN_PROGRESS_DELTA = 8;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    // El usuario y el perfil activo salen de la sesión firmada; nunca del cuerpo
    // (antes cualquiera podía escribir el historial de otra cuenta enviando su user_id).
    const user = await getSessionUser(cookies);
    if (!user) {
      return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    if (!user.perfilId) {
      return new Response(JSON.stringify({ error: 'Selecciona un perfil para guardar progreso' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }
    const userId = user.id;
    const perfilId = user.perfilId;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Solicitud inválida' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const episodioId = Number(body?.episodio_id);
    const progreso = Number(body?.progreso);
    const completado = Number(body?.completado ?? 0) ? 1 : 0;

    if (!Number.isInteger(episodioId) || episodioId <= 0 || !Number.isFinite(progreso)) {
      return new Response(JSON.stringify({ error: 'Datos incompletos' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Tope razonable (24 h) para no guardar valores absurdos.
    const safeProgress = Math.min(86_400, Math.max(0, Math.floor(progreso)));
    const now = Date.now();
    const throttleKey: ProgressKey = `${perfilId}:${episodioId}`;
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
      `INSERT INTO historial (usuario_id, perfil_id, episodio_id, progreso, completado)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE progreso = ?, completado = ?, fecha_actualizacion = NOW()`,
      [
        userId,
        perfilId,
        episodioId,
        safeProgress,
        completado,
        safeProgress,
        completado,
      ]
    );

    if (progressThrottle.size > 5000) {
      for (const [key, entry] of progressThrottle) {
        if (now - entry.timestamp > 60_000) progressThrottle.delete(key);
      }
    }
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
