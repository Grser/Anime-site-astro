-- Suscripciones realistas: periodo (mensual/anual), fecha de renovación por
-- usuario y tabla de facturas para el histórico.

-- 1) Enriquecemos la tabla suscripciones con periodo y precio anual opcional.
ALTER TABLE suscripciones
  ADD COLUMN IF NOT EXISTS periodo VARCHAR(16) NOT NULL DEFAULT 'mensual'
    AFTER precio,
  ADD COLUMN IF NOT EXISTS precio_anual DECIMAL(10,2) NULL
    AFTER periodo;

-- Backfill: los planes existentes se consideran mensuales (comportamiento
-- actual) y el precio_anual se deja NULL hasta que el admin lo complete.
UPDATE suscripciones SET periodo = 'mensual' WHERE periodo IS NULL OR periodo = '';

-- 2) Guardamos cuándo expira la suscripción del usuario para disparar la
-- facturación recurrente y mostrarlo en la UI ("se renueva el ...").
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS suscripcion_periodo VARCHAR(16) NULL
    AFTER suscripcion,
  ADD COLUMN IF NOT EXISTS suscripcion_hasta DATETIME NULL
    AFTER suscripcion_periodo;

-- 3) Facturas emitidas al usuario. Historial inmutable: aunque luego cambie
-- el precio o el nombre del plan, lo que facturó queda guardado.
CREATE TABLE IF NOT EXISTS facturas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT NOT NULL,
  suscripcion_nombre VARCHAR(50) NOT NULL,
  periodo VARCHAR(16) NOT NULL,            -- 'mensual' | 'anual'
  monto DECIMAL(10,2) NOT NULL,
  moneda VARCHAR(8) NOT NULL DEFAULT 'USD',
  metodo_pago VARCHAR(32) NULL,            -- 'tarjeta', 'paypal', 'simulado'
  estado VARCHAR(16) NOT NULL DEFAULT 'pagada', -- 'pagada', 'pendiente', 'fallida', 'reembolsada'
  periodo_inicio DATE NOT NULL,
  periodo_fin DATE NOT NULL,
  numero_factura VARCHAR(32) NOT NULL,     -- "CV-2026-000123", único por generación
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_facturas_numero (numero_factura),
  KEY idx_facturas_usuario (usuario_id, created_at),
  CONSTRAINT fk_facturas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
