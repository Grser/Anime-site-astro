-- Añade límite de perfiles por plan de suscripción. El valor es editable desde
-- el admin para que no haya que redeplegar al subir/bajar los límites.

ALTER TABLE suscripciones
  ADD COLUMN IF NOT EXISTS max_perfiles TINYINT UNSIGNED NOT NULL DEFAULT 1
  AFTER descripcion;

-- Backfill por nombre. Si estos nombres no coinciden con lo que tiene este
-- entorno, se puede editar manualmente desde /admin/suscripciones/editar/[id].
UPDATE suscripciones SET max_perfiles = 2 WHERE LOWER(nombre) = 'super'   AND max_perfiles < 2;
UPDATE suscripciones SET max_perfiles = 5 WHERE LOWER(nombre) = 'estelar' AND max_perfiles < 5;
