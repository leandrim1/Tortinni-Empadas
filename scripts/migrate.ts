import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

/**
 * Aplica as migrations versionadas. Drizzle registra o que já rodou em
 * `drizzle.__drizzle_migrations`, então a execução é idempotente.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL não definida. Veja o .env.example.');
    process.exit(1);
  }

  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    ssl: isLocal ? false : { rejectUnauthorized: true },
  });

  try {
    const db = drizzle(pool);
    console.log('Aplicando migrations...');
    await migrate(db, { migrationsFolder: './db/migrations' });
    console.log('Migrations aplicadas com sucesso.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Falha ao aplicar migrations:', error instanceof Error ? error.message : error);
  process.exit(1);
});
