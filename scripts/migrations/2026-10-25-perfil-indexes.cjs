// Chunk E: promueve perfil_id a la clave de unicidad en las 5 tablas per-user y a
// NOT NULL, dropeando las unicidades antiguas basadas en usuario_id. Es dinámica
// porque los nombres de los índices de usuario_id difieren según cómo fueron
// creados originalmente (algunos vienen de DDL en código, otros a mano).
//
// Lo que hace por cada tabla:
//   1. Busca cualquier índice UNIQUE o PRIMARY cuyas columnas sean exactamente
//      (usuario_id, <otras>) y lo dropea.
//   2. Añade una nueva UNIQUE / PRIMARY equivalente pero sobre (perfil_id, <otras>).
//      Si ya existe (reaplicación), la deja.
//   3. Verifica que no haya filas con perfil_id NULL y lo promueve a NOT NULL.
//
// La columna usuario_id se mantiene por compatibilidad con limpiezas administrativas
// (DELETE FROM ... WHERE usuario_id = ?). Nuevas escrituras populan ambas columnas.

const TABLES = [
  { table: 'historial', keyColumns: ['episodio_id'], primary: false },
  { table: 'favoritos', keyColumns: ['serie_id'], primary: false },
  { table: 'likes_dislikes', keyColumns: ['serie_id'], primary: false },
  { table: 'notificaciones_series', keyColumns: ['serie_id'], primary: true },
  { table: 'notificaciones', keyColumns: ['clave'], primary: false },
];

async function listIndexes(conn, table) {
  const [rows] = await conn.query(
    `SELECT index_name, non_unique, column_name, seq_in_index
       FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ?
      ORDER BY index_name, seq_in_index`,
    [table]
  );
  const byName = new Map();
  for (const r of rows) {
    const name = r.index_name || r.INDEX_NAME;
    const nonUnique = r.non_unique ?? r.NON_UNIQUE;
    const col = r.column_name || r.COLUMN_NAME;
    const current = byName.get(name) || { name, nonUnique: Number(nonUnique), cols: [] };
    current.cols.push(col);
    byName.set(name, current);
  }
  return Array.from(byName.values());
}

async function countNullPerfil(conn, table) {
  const [[row]] = await conn.query(`SELECT COUNT(*) AS total FROM ${table} WHERE perfil_id IS NULL`);
  return Number(row.total || 0);
}

async function tableExists(conn, table) {
  const [[row]] = await conn.query(
    `SELECT COUNT(*) AS total FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return Number(row.total) > 0;
}

async function hasPlainUsuarioIndex(conn, table) {
  // Hay otro índice (no el compuesto que vamos a dropear) cuya PRIMERA columna
  // sea usuario_id? Alcanza para que un FK sobre usuario_id use ese como backing.
  const indexes = await listIndexes(conn, table);
  for (const idx of indexes) {
    if (idx.cols[0] === 'usuario_id' && idx.cols.length === 1) return true;
  }
  return false;
}

async function migrateTable(conn, { table, keyColumns, primary }) {
  if (!(await tableExists(conn, table))) {
    console.log(`  (skipped) ${table} no existe en esta DB`);
    return;
  }

  const wantedOldCols = ['usuario_id', ...keyColumns].slice().sort().join(',');
  const wantedNewCols = ['perfil_id', ...keyColumns].slice().sort().join(',');

  // 1. Si alguna FK apunta a usuario_id, puede estar usando el UNIQUE compuesto
  //    como backing index. MySQL rechaza el DROP en ese caso. Añadimos primero
  //    un KEY plano sobre usuario_id (idempotente) para que la FK tenga a dónde
  //    migrar antes de dropear el compuesto.
  if (!(await hasPlainUsuarioIndex(conn, table))) {
    const idxName = `idx_${table}_usuario`.slice(0, 64);
    try {
      console.log(`  ${table}: adding plain KEY ${idxName} (usuario_id) para preservar FKs`);
      await conn.query(`ALTER TABLE ${table} ADD KEY \`${idxName}\` (usuario_id)`);
    } catch (err) {
      if (!/Duplicate key name/i.test(err.message)) throw err;
    }
  }

  // 2. Re-backfill por si entraron filas con perfil_id NULL después de la
  //    migración de chunk A+B (código viejo todavía desplegado, admin inserts, etc.).
  //    Las dirigimos al perfil es_principal del mismo usuario.
  console.log(`  ${table}: re-backfilling perfil_id for any NULL rows`);
  await conn.query(
    `UPDATE ${table} t
       JOIN perfiles p ON p.usuario_id = t.usuario_id AND p.es_principal = 1
        SET t.perfil_id = p.id
      WHERE t.perfil_id IS NULL`
  );

  // 3. Verificar que no quedan huérfanos (filas con usuario_id que ya no apunta
  //    a ningún usuario, o perfil_id NULL por otra razón) antes de promover.
  const nulls = await countNullPerfil(conn, table);
  if (nulls > 0) {
    throw new Error(
      `${table} tiene ${nulls} filas con perfil_id NULL incluso tras el backfill. ` +
        `Probablemente son huérfanos (usuario_id apunta a cuenta eliminada). ` +
        `Revisa con: SELECT * FROM ${table} WHERE perfil_id IS NULL;`
    );
  }

  // 4. Promover perfil_id a NOT NULL. Hacerlo ANTES de añadir el PRIMARY/UNIQUE
  //    porque MySQL exige NOT NULL para columnas de un PRIMARY KEY.
  console.log(`  ${table}: making perfil_id NOT NULL`);
  await conn.query(`ALTER TABLE ${table} MODIFY COLUMN perfil_id INT NOT NULL`);

  // 5. Dropear el UNIQUE/PRIMARY antiguo matching (usuario_id, X).
  //    Releer los índices aquí: el paso 1 pudo haber añadido uno nuevo.
  const indexes = await listIndexes(conn, table);
  for (const idx of indexes) {
    if (Number(idx.nonUnique) !== 0) continue; // only unique/primary
    const normalized = idx.cols.slice().sort().join(',');
    if (normalized === wantedOldCols) {
      if (idx.name === 'PRIMARY') {
        console.log(`  ${table}: dropping PRIMARY KEY (${idx.cols.join(', ')})`);
        await conn.query(`ALTER TABLE ${table} DROP PRIMARY KEY`);
      } else {
        console.log(`  ${table}: dropping INDEX ${idx.name} (${idx.cols.join(', ')})`);
        await conn.query(`ALTER TABLE ${table} DROP INDEX \`${idx.name}\``);
      }
    }
  }

  // 6. Añadir el nuevo UNIQUE/PRIMARY sobre (perfil_id, X) si falta.
  //    Nota: puede existir ya un KEY no único con las mismas columnas (lo creó
  //    la migración de chunk A+B como idx_<table>_perfil); eso no bloquea añadir
  //    el UNIQUE encima — simplemente convive como índice adicional.
  const refreshed = await listIndexes(conn, table);
  const alreadyNew = refreshed.find(
    (idx) => Number(idx.nonUnique) === 0 && idx.cols.slice().sort().join(',') === wantedNewCols
  );
  if (!alreadyNew) {
    const newCols = ['perfil_id', ...keyColumns].join(', ');
    if (primary) {
      console.log(`  ${table}: adding PRIMARY KEY (${newCols})`);
      await conn.query(`ALTER TABLE ${table} ADD PRIMARY KEY (${newCols})`);
    } else {
      const name = `uniq_${table}_perfil_${keyColumns.join('_')}`.slice(0, 64);
      console.log(`  ${table}: adding UNIQUE ${name} (${newCols})`);
      await conn.query(`ALTER TABLE ${table} ADD UNIQUE KEY \`${name}\` (${newCols})`);
    }
  } else {
    console.log(`  ${table}: new unique on (perfil_id, ${keyColumns.join(', ')}) already present`);
  }
}

module.exports = async function (conn) {
  for (const spec of TABLES) {
    await migrateTable(conn, spec);
  }
};
