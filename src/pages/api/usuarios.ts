import type { APIRoute } from 'astro';
import mysql from 'mysql2/promise';

export const GET: APIRoute = async () => {
  const connection = await mysql.createConnection({
    host: import.meta.env.MYSQL_HOST,
    user: import.meta.env.MYSQL_USER,
    password: import.meta.env.MYSQL_PASSWORD,
    database: import.meta.env.MYSQL_DATABASE,
  });

  const [rows] = await connection.query('SELECT * FROM usuarios');
  await connection.end();

  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
