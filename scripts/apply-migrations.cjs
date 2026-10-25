#!/usr/bin/env node
// Simple MySQL migration runner.
// Lee scripts/migrations/*.sql en orden alfabético, aplica cada archivo UNA sola vez
// y registra el nombre aplicado en la tabla schema_migrations. Rerun seguro.
//
// Uso:
//   node scripts/apply-migrations.cjs           # aplica pendientes
//   node scripts/apply-migrations.cjs --dry-run # muestra qué aplicaría
//   node scripts/apply-migrations.cjs --status  # muestra qué está aplicado

const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] != null) continue;
    const value = raw.replace(/^["']|["']$/g, '');
    process.env[key] = value;
  }
}

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'conexiones',
  password: process.env.DB_PASSWORD ?? '1234',
  database: process.env.DB_NAME || 'streamplus',
  multipleStatements: true,
};

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const STATUS = args.has('--status');

async function ensureTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function main() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') || f.endsWith('.cjs') || f.endsWith('.js'))
    .sort();

  if (files.length === 0) {
    console.log('No hay migraciones en', MIGRATIONS_DIR);
    return;
  }

  const conn = await mysql.createConnection(DB_CONFIG);
  try {
    await ensureTable(conn);
    const [rows] = await conn.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));

    if (STATUS) {
      console.log(`Migraciones registradas (DB=${DB_CONFIG.database}):`);
      for (const f of files) {
        console.log(`  [${applied.has(f) ? 'x' : ' '}] ${f}`);
      }
      return;
    }

    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log('Todas las migraciones ya están aplicadas.');
      return;
    }

    for (const name of pending) {
      const migrationPath = path.join(MIGRATIONS_DIR, name);
      console.log(`${DRY_RUN ? '[dry-run] ' : ''}Aplicando ${name}...`);
      if (DRY_RUN) continue;
      try {
        if (name.endsWith('.sql')) {
          const sql = fs.readFileSync(migrationPath, 'utf8');
          await conn.query(sql);
        } else {
          // Migraciones JS/CJS exportan una función async(conn) para hacer
          // cambios condicionales (consultar information_schema, DROP/ADD
          // índices según nombres reales, etc.).
          delete require.cache[require.resolve(migrationPath)];
          const migration = require(migrationPath);
          const fn = typeof migration === 'function' ? migration : migration.default;
          if (typeof fn !== 'function') {
            throw new Error('Migración JS debe exportar una función (module.exports = async function(conn) {...})');
          }
          await fn(conn);
        }
        await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [name]);
        console.log(`  ✓ ${name} aplicada`);
      } catch (err) {
        console.error(`  ✗ ${name} falló:`, err.message);
        console.error('    Detén y revisa el estado antes de reintentar.');
        process.exit(1);
      }
    }

    if (DRY_RUN) console.log('(dry-run: ninguna migración se escribió a la DB)');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Error del runner:', err);
  process.exit(1);
});
