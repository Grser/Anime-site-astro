// test-db.js
import mysql from 'mysql2/promise';

const dbConfig = {
  host: 'db.clawn.cat',     // Cambia si usas un host diferente
  port: 3306,            // Puerto por defecto
  user: 'conexiones',          // Usuario de tu DB
  password: '1234',          // Contraseña de tu DB
  database: 'streamplus' // Nombre de tu base de datos
};

async function testConnection() {
  try {
    const connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexión a la base de datos exitosa');

    const [rows] = await connection.execute('SELECT NOW() AS fecha;');
    console.log('🕓 Respuesta desde la DB:', rows[0]);

    await connection.end();
  } catch (error) {
    console.error('❌ Error de conexión a la base de datos:', error.message);
  }
}

testConnection();
