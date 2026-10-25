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
  const indexes = await listIndexes(conn, table);

  // 0. Si alguna FK apunta a usuario_id, puede estar usando el UNIQUE compuesto
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

  // 1. Drop old unique/primary matching usuario_id + keyColumns
  for (const idx of indexes) {
    if (Number(idx.nonUnique) !== 0) continue; // only unique
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

  // 2. Add new unique/primary on perfil_id + keyColumns if missing
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

  // 3. Promote perfil_id to NOT NULL if no stragglers.
  const nulls = await countNullPerfil(conn, table);
  if (nulls > 0) {
    throw new Error(
      `${table} tiene ${nulls} filas con perfil_id NULL. Revisa esos registros huérfanos antes de reaplicar.`
    );
  }
  console.log(`  ${table}: making perfil_id NOT NULL`);
  await conn.query(`ALTER TABLE ${table} MODIFY COLUMN perfil_id INT NOT NULL`);
}

module.exports = async function (conn) {
  for (const spec of TABLES) {
    await migrateTable(conn, spec);
  }
};
