-- Marcadores de intro y outro (en segundos) para el player.
-- NULL en cualquiera de los dos extremos desactiva el skip correspondiente.

ALTER TABLE episodios
  ADD COLUMN IF NOT EXISTS intro_start_seconds INT UNSIGNED NULL AFTER suscripcion_requerida,
  ADD COLUMN IF NOT EXISTS intro_end_seconds   INT UNSIGNED NULL AFTER intro_start_seconds,
  ADD COLUMN IF NOT EXISTS outro_start_seconds INT UNSIGNED NULL AFTER intro_end_seconds,
  ADD COLUMN IF NOT EXISTS outro_end_seconds   INT UNSIGNED NULL AFTER outro_start_seconds;
