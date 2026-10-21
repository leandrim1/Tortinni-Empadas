import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../db/schema';
import { env } from './env';

export type Database = NodePgDatabase<typeof schema>;

/**
 * Em ambiente serverless cada invocação pode reutilizar o processo.
 * Guardamos o pool no escopo do módulo para aproveitar conexões entre
 * invocações quentes, com limite baixo para não esgotar o Neon.
 */
let pool: pg.Pool | undefined;
let database: Database | undefined;

/** Injetado pelos testes de integração (PGlite). */
let override: Database | undefined;

export function setDatabaseOverride(db: Database | undefined): void {
  override = db;
}

function createPool(): pg.Pool {
  const connectionString = env.databaseUrl;
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  return new pg.Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: isLocal ? false : { rejectUnauthorized: true },
  });
}

export function getDb(): Database {
  if (override) return override;
  if (!database) {
    pool = createPool();
    pool.on('error', (err) => {
      // Erros de conexão ociosa não devem derrubar a função.
      console.error(JSON.stringify({ level: 'error', message: 'pg pool error', error: err.message }));
    });
    database = drizzle(pool, { schema, logger: false });
  }
  return database;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    database = undefined;
  }
}

export { schema };
