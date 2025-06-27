// test-db.js
import mysql from 'mysql2/promise';
import assert from 'node:assert';

const dbConfig = {
  host: process.env.DB_HOST || 'db.clawn.cat',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || 'conexiones',
  password: process.env.DB_PASSWORD || '1234',
  database: process.env.DB_NAME || 'streamplus'
};

async function testConnection() {
  try {
    const connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexión a la base de datos exitosa');

    const [rows] = await connection.execute('SELECT NOW() AS fecha;');
    assert(rows.length > 0, 'La consulta no devolvió resultados');
    console.log('🕓 Respuesta desde la DB:', rows[0]);

    await connection.end();
  } catch (error) {
    console.error('❌ Error de conexión a la base de datos:', error.message);
  }
}

testConnection();
