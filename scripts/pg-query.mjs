// Helper de una sola query: SQL en argv[2] → filas como JSON en stdout.
// Usado por record-fixtures.sh (antes hablaba con D1 vía `wrangler d1
// execute`; ahora Postgres directo, mismas credenciales que la app).
import postgres from 'postgres';

const sql = postgres({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT || '5432'),
  database: process.env.PG_DB,
  username: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

const rows = await sql.unsafe(process.argv[2]);
console.log(JSON.stringify([...rows], null, 2));
await sql.end();
