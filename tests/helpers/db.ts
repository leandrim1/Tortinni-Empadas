import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../../db/schema';
import { setDatabaseOverride, type Database } from '../../server/lib/db';
import { seed } from '../../db/seed';

export interface TestDatabase {
  db: Database;
  client: PGlite;
  close: () => Promise<void>;
}

/**
 * Banco Postgres real e efêmero (PGlite, em memória) com as migrations
 * versionadas aplicadas. Os testes exercitam o SQL de verdade, não um mock.
 */
export async function createTestDatabase(options: { seedData?: boolean } = {}): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Database;

  await migrate(db as never, { migrationsFolder: './db/migrations' });
  if (options.seedData !== false) {
    await seed(db as never, { quiet: true });
  }

  setDatabaseOverride(db);

  return {
    db,
    client,
    close: async () => {
      setDatabaseOverride(undefined);
      await client.close();
    },
  };
}
