import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import { hashPassword } from '../server/lib/crypto';

/**
 * Criação segura do primeiro administrador.
 *
 * Nenhuma senha vive no código ou no banco de seed: ela é digitada aqui,
 * por quem tem acesso ao servidor, e só o hash scrypt é persistido.
 * Use `npm run admin:create`.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL não definida. Veja o .env.example.');
    process.exit(1);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const name = (process.env.ADMIN_NAME ?? (await rl.question('Nome do administrador: '))).trim();
  const email = (process.env.ADMIN_EMAIL ?? (await rl.question('E-mail: '))).trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? (await rl.question('Senha (mín. 8 caracteres, letras e números): '));
  rl.close();

  if (name.length < 2) throw new Error('Nome inválido.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.');
  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('A senha precisa ter ao menos 8 caracteres, com letras e números.');
  }

  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  const pool = new pg.Pool({ connectionString, max: 1, ssl: isLocal ? false : { rejectUnauthorized: true } });

  try {
    const db = drizzle(pool, { schema });
    const existing = await db
      .select({ id: schema.adminUsers.id })
      .from(schema.adminUsers)
      .where(sql`lower(${schema.adminUsers.email}) = ${email}`)
      .limit(1);

    const passwordHash = await hashPassword(password);

    if (existing[0]) {
      await db
        .update(schema.adminUsers)
        .set({ passwordHash, name, role: 'admin', isActive: true, deletedAt: null, updatedAt: new Date() })
        .where(sql`lower(${schema.adminUsers.email}) = ${email}`);
      console.log(`Administrador atualizado: ${email}`);
    } else {
      await db.insert(schema.adminUsers).values({ name, email, passwordHash, role: 'admin' });
      console.log(`Administrador criado: ${email}`);
    }
    console.log('Acesse /admin e entre com estas credenciais.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Falha:', error instanceof Error ? error.message : error);
  process.exit(1);
});
