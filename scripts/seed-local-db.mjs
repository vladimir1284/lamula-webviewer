import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const WORKSPACE_DIR = process.cwd();
const SCHEMA_FILE = join(WORKSPACE_DIR, 'tests/contract/schema/0001_init.sql');
const FIXTURES_DIR = join(WORKSPACE_DIR, 'server/dal/fixtures');
const TEMP_SEED_FILE = join(WORKSPACE_DIR, 'temp-seed.sql');

function escapeValue(val) {
  if (val === null || val === undefined) {
    return 'NULL';
  }
  if (typeof val === 'number') {
    return val.toString();
  }
  if (typeof val === 'boolean') {
    return val ? '1' : '0';
  }
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  return `'${val.toString().replace(/'/g, "''")}'`;
}

async function setup() {
  try {
    console.log('0/3 Cleaning existing local D1 database files...');
    try {
      const { rmSync } = await import('node:fs');
      rmSync(join(WORKSPACE_DIR, '.wrangler/state/v3/d1'), { recursive: true, force: true });
    } catch {
      // Ignore
    }

    console.log('1/3 Initializing local D1 database schema...');
    execSync(`pnpm exec wrangler d1 execute nexrad-l3 --local --file="${SCHEMA_FILE}"`, {
      stdio: 'inherit',
    });

    console.log('2/3 Generating seed SQL from fixtures...');
    const tables = ['radars', 'products', 'rasters', 'phenomena', 'vwp'];
    let sql = '';

    for (const table of tables) {
      const filePath = join(FIXTURES_DIR, `${table}.json`);
      const data = JSON.parse(readFileSync(filePath, 'utf8'));
      
      if (data.length === 0) continue;
      
      const columns = Object.keys(data[0]);
      
      for (const row of data) {
        const vals = columns.map(col => escapeValue(row[col]));
        sql += `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${vals.join(', ')});\n`;
      }
    }

    writeFileSync(TEMP_SEED_FILE, sql, 'utf8');

    console.log('3/3 Populating local database with seeded rows...');
    execSync(`pnpm exec wrangler d1 execute nexrad-l3 --local --file="${TEMP_SEED_FILE}"`, {
      stdio: 'inherit',
    });

    console.log('✓ Local database successfully setup and seeded.');
  } catch (error) {
    console.error('Error during database setup:', error);
    process.exit(1);
  } finally {
    try {
      unlinkSync(TEMP_SEED_FILE);
    } catch {
      // Ignore if it doesn't exist
    }
  }
}

setup();
