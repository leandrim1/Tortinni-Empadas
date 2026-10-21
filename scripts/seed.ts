import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../db/schema';
import { seed } from '../db/seed';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL não definida. Veja o .env.example.');
    process.exit(1);
  }
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  const pool = new pg.Pool({ connectionString, max: 1, ssl: isLocal ? false : { rejectUnauthorized: true } });
  try {
    await seed(drizzle(pool, { schema }));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Falha no seed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
