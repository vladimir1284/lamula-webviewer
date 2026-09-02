// Inicializa y puebla un Postgres local de desarrollo (docker run
// postgres:16-alpine, o el que ya tengas) con el schema real del
// pipeline (snapshot en tests/contract/schema/0001_init.sql) y las
// mismas fixtures que usa el adaptador `fixture` — para probar el
// adaptador `live` en local sin tocar el Postgres de producción.
//
// Uso:
//   PG_HOST=localhost PG_DB=nexrad_l3_dev PG_USER=nexrad PG_PASSWORD=nexrad \
//     pnpm db:setup
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const WORKSPACE_DIR = process.cwd();
const SCHEMA_FILE = join(WORKSPACE_DIR, 'tests/contract/schema/0001_init.sql');
const FIXTURES_DIR = join(WORKSPACE_DIR, 'server/dal/fixtures');
const TABLES = ['radars', 'products', 'rasters', 'phenomena', 'vwp', 'wind_grids', 'lightning_buckets'];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`falta ${name} en el entorno (ver comentario de cabecera de este script)`);
    process.exit(1);
  }
  return value;
}

async function setup() {
  const sql = postgres({
    host: requireEnv('PG_HOST'),
    port: Number(process.env.PG_PORT || '5432'),
    database: requireEnv('PG_DB'),
    username: requireEnv('PG_USER'),
    password: requireEnv('PG_PASSWORD'),
  });

  try {
    console.log('1/3 Aplicando schema...');
    // DROP+recrea: dev-only, más simple que llevar un runner de
    // migraciones acá también (el pipeline ya tiene el suyo en db/).
    for (const table of [...TABLES].reverse()) {
      await sql.unsafe(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }
    await sql.unsafe(readFileSync(SCHEMA_FILE, 'utf8'));

    console.log('2/3 Insertando fixtures...');
    for (const table of TABLES) {
      const rows = JSON.parse(readFileSync(join(FIXTURES_DIR, `${table}.json`), 'utf8'));
      if (rows.length === 0) continue;
      await sql`INSERT INTO ${sql(table)} ${sql(rows, ...Object.keys(rows[0]))}`;
    }

    console.log('3/3 Listo.');
    for (const table of TABLES) {
      const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM ${sql(table)}`;
      console.log(`  ${table}: ${n} filas`);
    }
  }
  finally {
    await sql.end();
  }
}

setup().catch((err) => {
  console.error('Error durante el seed:', err);
  process.exit(1);
});
