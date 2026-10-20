-- Multi-perfiles por cuenta: una cuenta puede tener varios perfiles (Netflix/Crunchyroll style).
-- Backfill crea un "perfil principal" por cada usuario existente y asigna todos sus registros
-- per-user (historial, favoritos, likes_dislikes, notificaciones_series, notificaciones) a él.
-- La columna perfil_id queda NULLABLE en esta migración para que las APIs sigan funcionando
-- con usuario_id mientras se migran una a una (chunk E del plan).

CREATE TABLE IF NOT EXISTS perfiles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  usuario_id INT NOT NULL,
  nombre VARCHAR(60) NOT NULL,
  avatar VARCHAR(255) NULL,
  es_nino TINYINT(1) NOT NULL DEFAULT 0,
  maturity_level TINYINT NOT NULL DEFAULT 2,
  pin_hash CHAR(60) NULL,
  orden TINYINT NOT NULL DEFAULT 0,
  es_principal TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_perfiles_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  KEY idx_perfiles_usuario (usuario_id, orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Crear un perfil principal por cada usuario que todavía no tenga ninguno.
INSERT INTO perfiles (usuario_id, nombre, avatar, es_principal, orden)
SELECT u.id,
       COALESCE(NULLIF(TRIM(u.apodo), ''), u.nickname),
       u.imagen,
       1,
       0
FROM usuarios u
LEFT JOIN perfiles p ON p.usuario_id = u.id
WHERE p.id IS NULL;

-- Añadir perfil_id a tablas per-user. NULLABLE para transición segura.
-- Si una ALTER falla porque la columna ya existe (reaplicación), hay que ejecutar
-- esta migración en una base limpia o eliminar la columna antes de reaplicar.

ALTER TABLE historial
  ADD COLUMN perfil_id INT NULL AFTER usuario_id,
  ADD KEY idx_historial_perfil (perfil_id, episodio_id);

ALTER TABLE favoritos
  ADD COLUMN perfil_id INT NULL AFTER usuario_id,
  ADD KEY idx_favoritos_perfil (perfil_id, serie_id);

ALTER TABLE likes_dislikes
  ADD COLUMN perfil_id INT NULL AFTER usuario_id,
  ADD KEY idx_likes_perfil (perfil_id, serie_id);

ALTER TABLE notificaciones_series
  ADD COLUMN perfil_id INT NULL AFTER usuario_id,
  ADD KEY idx_notis_series_perfil (perfil_id, serie_id);

ALTER TABLE notificaciones
  ADD COLUMN perfil_id INT NULL AFTER usuario_id,
  ADD KEY idx_notis_perfil (perfil_id, leida);

-- Backfill: cada registro va al perfil principal de su usuario.
UPDATE historial h
  JOIN perfiles p ON p.usuario_id = h.usuario_id AND p.es_principal = 1
  SET h.perfil_id = p.id
  WHERE h.perfil_id IS NULL;

UPDATE favoritos f
  JOIN perfiles p ON p.usuario_id = f.usuario_id AND p.es_principal = 1
  SET f.perfil_id = p.id
  WHERE f.perfil_id IS NULL;

UPDATE likes_dislikes l
  JOIN perfiles p ON p.usuario_id = l.usuario_id AND p.es_principal = 1
  SET l.perfil_id = p.id
  WHERE l.perfil_id IS NULL;

UPDATE notificaciones_series n
  JOIN perfiles p ON p.usuario_id = n.usuario_id AND p.es_principal = 1
  SET n.perfil_id = p.id
  WHERE n.perfil_id IS NULL;

UPDATE notificaciones n
  JOIN perfiles p ON p.usuario_id = n.usuario_id AND p.es_principal = 1
  SET n.perfil_id = p.id
  WHERE n.perfil_id IS NULL;

-- NOTA: Los registros huérfanos (usuario_id apunta a cuenta inexistente) quedan con
-- perfil_id = NULL. Revisarlos manualmente antes de promover la columna a NOT NULL
-- en una migración posterior cuando todas las APIs usen perfil_id (chunk E).
