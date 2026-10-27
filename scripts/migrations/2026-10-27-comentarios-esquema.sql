-- La tabla `comentarios` en bases viejas quedó con el esquema inicial
-- (usuario_nickname, comentario, fecha), pero el código asume
-- (usuario_id, texto, created_at). Esta migración:
--   1. Agrega las columnas nuevas si no existen (MariaDB 10.6 soporta IF NOT EXISTS).
--   2. Backfillea las nuevas con los valores viejos cuando se puedan mapear.
--   3. Deja las columnas viejas en su sitio (no las borra) para no perder datos
--      ni romper algún job que todavía las lea; se pueden eliminar en otra
--      migración más adelante cuando se confirme que nada depende de ellas.

ALTER TABLE comentarios
  ADD COLUMN IF NOT EXISTS usuario_id INT NULL AFTER id,
  ADD COLUMN IF NOT EXISTS texto      VARCHAR(1000) NULL AFTER episodio_id,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER texto;

-- Backfill: busca el usuario por nickname (puede fallar si el nickname cambió);
-- los no mapeados quedan en 0 (que la API trata como "Usuario" en la UI).
UPDATE comentarios c
  LEFT JOIN usuarios u ON u.nickname = c.usuario_nickname
     SET c.usuario_id = COALESCE(c.usuario_id, u.id, 0)
   WHERE c.usuario_id IS NULL;

UPDATE comentarios SET texto = comentario
 WHERE texto IS NULL AND comentario IS NOT NULL;

UPDATE comentarios SET created_at = fecha
 WHERE fecha IS NOT NULL;

-- Convierte las nuevas a NOT NULL una vez backfilleadas.
UPDATE comentarios SET usuario_id = 0 WHERE usuario_id IS NULL;
UPDATE comentarios SET texto      = ''  WHERE texto IS NULL;

ALTER TABLE comentarios
  MODIFY COLUMN usuario_id INT NOT NULL,
  MODIFY COLUMN texto      VARCHAR(1000) NOT NULL;

-- Índices que la API espera para los listados por episodio y por usuario.
ALTER TABLE comentarios
  ADD KEY IF NOT EXISTS idx_comentarios_episodio (episodio_id, created_at),
  ADD KEY IF NOT EXISTS idx_comentarios_usuario  (usuario_id);
