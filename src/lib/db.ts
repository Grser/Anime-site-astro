import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: 'db.clawn.net',
  user: 'conexiones',
  password: '1234',
  database: 'streamplus',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

export default pool; //datos para admin