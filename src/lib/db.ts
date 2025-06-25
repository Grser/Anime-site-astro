// src/lib/db.ts
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'db.clawn.cat',
  user: 'conexiones',
  password: '1234',
  database: 'streamplus',
  waitForConnections: true,
  connectionLimit: 5,
});

export default pool;
