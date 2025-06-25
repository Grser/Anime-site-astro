import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: 'db.clawn.cat',       // Cambia según tu configuración
  user: 'conexiones',
  password: '1234',
  database: 'streamplus',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

export default pool;