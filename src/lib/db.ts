import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: '181.74.91.206',       // Cambia según tu configuración
  user: 'user',
  password: '1234',
  database: 'streamplus',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});
