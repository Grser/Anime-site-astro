import type { AstroCookies } from 'astro';
import db from './db';
import { getActiveProfileId, getSessionUserId } from './session';

/**
 * Devuelve el id del perfil principal del usuario, creándolo si no existe.
 * Las notificaciones de origen administrativo (aprobación de solicitudes, etc.)
 * se asignan al principal porque no están ligadas a un perfil específico.
 */
const resolvePrincipalPerfil = async (userId: number): Promise<number | null> => {
  const [[row]] = await db.query<any[]>(
    `SELECT id FROM perfiles
      WHERE usuario_id = ?
      ORDER BY es_principal DESC, orden ASC, id ASC
      LIMIT 1`,
    [userId]
  );
  return row ? Number(row.id) : null;
};

let schemaPromise: Promise<void> | null = null;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS anime_solicitudes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    usuario_id INT NOT NULL,
    titulo VARCHAR(180) NOT NULL,
    enlace VARCHAR(500) NULL,
    comentario TEXT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    respuesta VARCHAR(500) NULL,
    anime_url VARCHAR(500) NULL,
    admin_id INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_anime_solicitudes_usuario (usuario_id, created_at),
    KEY idx_anime_solicitudes_estado (estado, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS notificaciones (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    usuario_id INT NOT NULL,
    tipo VARCHAR(40) NOT NULL,
    titulo VARCHAR(220) NOT NULL,
    mensaje VARCHAR(700) NOT NULL,
    enlace VARCHAR(500) NULL,
    clave VARCHAR(190) NULL,
    leida TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_notificacion_usuario_clave (usuario_id, clave),
    KEY idx_notificaciones_usuario (usuario_id, leida, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS notificaciones_series (
    usuario_id INT NOT NULL,
    serie_id INT NOT NULL,
    activa TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (usuario_id, serie_id),
    KEY idx_notificaciones_series_serie (serie_id, activa)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS comentarios (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    episodio_id INT NOT NULL,
    usuario_id INT NOT NULL,
    texto VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_comentarios_episodio (episodio_id, created_at),
    KEY idx_comentarios_usuario (usuario_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

export const getUserId = (cookies: AstroCookies) => getSessionUserId(cookies);
export const getPerfilId = (cookies: AstroCookies) => getActiveProfileId(cookies);

export const ensureCommunityTables = async () => {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      for (const statement of schemaStatements) {
        await db.query(statement);
      }

      const [[animeUrlColumn]] = await db.query<any[]>(
        `SELECT 1 AS found
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'anime_solicitudes'
            AND COLUMN_NAME = 'anime_url'
          LIMIT 1`
      );
      if (!animeUrlColumn) {
        await db.query('ALTER TABLE anime_solicitudes ADD COLUMN anime_url VARCHAR(500) NULL AFTER respuesta');
      }
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  await schemaPromise;
};

export const createNotification = async ({
  userId,
  perfilId,
  type,
  title,
  message,
  link = null,
  key = null,
}: {
  userId: number;
  /** Si se omite, se usa el perfil principal del usuario. */
  perfilId?: number | null;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  key?: string | null;
}) => {
  await ensureCommunityTables();
  const targetPerfil = perfilId && perfilId > 0 ? perfilId : await resolvePrincipalPerfil(userId);
  await db.query(
    `INSERT IGNORE INTO notificaciones
      (usuario_id, perfil_id, tipo, titulo, mensaje, enlace, clave)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, targetPerfil, type, title, message, link, key]
  );
};

export const notifySeriesFollowers = async ({
  seriesId,
  type,
  title,
  message,
  link,
  key,
}: {
  seriesId: number;
  type: 'nuevo_episodio' | 'nueva_temporada' | 'actualizacion_serie';
  title: string;
  message: string;
  link: string;
  key: string;
}) => {
  await ensureCommunityTables();
  // Cada follower es un (perfil, serie) → cada perfil que sigue recibe su propia
  // notificación en su propia bandeja. El usuario_id viene del mismo registro.
  await db.query(
    `INSERT IGNORE INTO notificaciones
      (usuario_id, perfil_id, tipo, titulo, mensaje, enlace, clave)
     SELECT ns.usuario_id, ns.perfil_id, ?, ?, ?, ?, ?
       FROM notificaciones_series ns
      WHERE ns.serie_id = ? AND ns.activa = 1`,
    [type, title, message, link, key, seriesId]
  );
};
