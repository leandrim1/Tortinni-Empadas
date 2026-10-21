import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { users, adminUsers, passwordResetTokens, emailVerificationTokens } from '../../db/schema';
import { hashPassword, verifyPassword, generateToken, hashToken } from '../lib/crypto';
import { badRequest, conflict, notFound, unauthorized } from '../lib/errors';
import { env } from '../lib/env';
import { sendEmail, renderPasswordResetEmail, renderVerificationEmail } from './email';
import { revokeAllSessions } from '../lib/session';
import { logger } from '../lib/logger';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const RESET_TTL_MS = 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
}

function toPublicUser(row: typeof users.$inferSelect): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    emailVerified: row.emailVerifiedAt !== null,
  };
}

export async function registerCustomer(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
}): Promise<{ user: PublicUser; verificationSent: boolean }> {
  const db = getDb();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email}`)
    .limit(1);

  if (existing[0]) {
    throw conflict('Já existe uma conta com este e-mail. Tente entrar ou recuperar a senha.');
  }

  const passwordHash = await hashPassword(input.password);
  const inserted = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      passwordHash,
    })
    .returning();

  const user = inserted[0];
  if (!user) throw new Error('Falha ao criar a conta.');

  const verificationSent = await issueEmailVerification(user.id, user.name, user.email);
  return { user: toPublicUser(user), verificationSent };
}

/** Emite verificação de e-mail apenas quando há provedor configurado. */
export async function issueEmailVerification(
  userId: string,
  name: string,
  email: string,
): Promise<boolean> {
  if (!env.emailConfigured) return false;
  const db = getDb();
  const token = generateToken(32);
  await db.insert(emailVerificationTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
  });
  const url = `${env.publicSiteUrl}/conta/verificar?token=${encodeURIComponent(token)}`;
  const message = renderVerificationEmail(name, url);
  const result = await sendEmail({ ...message, to: email });
  return result.delivered;
}

export async function verifyEmail(token: string): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.tokenHash, hashToken(token)))
    .limit(1);
  const record = rows[0];
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw badRequest('Link de verificação inválido ou expirado.');
  }
  await db.transaction(async (tx) => {
    await tx
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationTokens.id, record.id));
    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, record.userId));
  });
}

interface LoginSubject {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  isActive?: boolean;
  role?: string;
}

/**
 * Login com proteção contra força bruta: após 5 falhas a conta fica
 * bloqueada por 15 minutos. A mensagem é sempre a mesma para
 * e-mail inexistente e senha errada (não revela quais contas existem).
 */
async function authenticate(
  subject: LoginSubject | undefined,
  password: string,
  onFailure: (id: string, attempts: number, lockedUntil: Date | null) => Promise<void>,
  onSuccess: (id: string) => Promise<void>,
): Promise<LoginSubject> {
  const genericError = unauthorized('E-mail ou senha incorretos.');

  if (!subject) {
    // Gasta tempo comparável para não vazar existência da conta por timing.
    await verifyPassword(password, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
    throw genericError;
  }

  if (subject.lockedUntil && subject.lockedUntil > new Date()) {
    const minutes = Math.ceil((subject.lockedUntil.getTime() - Date.now()) / 60000);
    throw unauthorized(`Conta temporariamente bloqueada. Tente novamente em ${minutes} min.`);
  }

  if (subject.isActive === false) {
    throw unauthorized('Este acesso está desativado. Fale com o administrador.');
  }

  const valid = await verifyPassword(password, subject.passwordHash);
  if (!valid) {
    const attempts = subject.failedLoginAttempts + 1;
    const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60000) : null;
    await onFailure(subject.id, attempts, lockedUntil);
    throw genericError;
  }

  await onSuccess(subject.id);
  return subject;
}

export async function loginCustomer(email: string, password: string): Promise<PublicUser> {
  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = ${email}`, isNull(users.deletedAt)))
    .limit(1);
  const row = rows[0];

  await authenticate(
    row
      ? {
          id: row.id,
          name: row.name,
          email: row.email,
          passwordHash: row.passwordHash,
          failedLoginAttempts: row.failedLoginAttempts,
          lockedUntil: row.lockedUntil,
        }
      : undefined,
    password,
    async (id, attempts, lockedUntil) => {
      await db.update(users).set({ failedLoginAttempts: attempts, lockedUntil }).where(eq(users.id, id));
    },
    async (id) => {
      await db
        .update(users)
        .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
        .where(eq(users.id, id));
    },
  );

  return toPublicUser(row!);
}

export interface AdminAccount {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'operator';
}

export async function loginAdmin(email: string, password: string): Promise<AdminAccount> {
  const db = getDb();
  const rows = await db
    .select()
    .from(adminUsers)
    .where(and(sql`lower(${adminUsers.email}) = ${email}`, isNull(adminUsers.deletedAt)))
    .limit(1);
  const row = rows[0];

  await authenticate(
    row
      ? {
          id: row.id,
          name: row.name,
          email: row.email,
          passwordHash: row.passwordHash,
          failedLoginAttempts: row.failedLoginAttempts,
          lockedUntil: row.lockedUntil,
          isActive: row.isActive,
          role: row.role,
        }
      : undefined,
    password,
    async (id, attempts, lockedUntil) => {
      await db.update(adminUsers).set({ failedLoginAttempts: attempts, lockedUntil }).where(eq(adminUsers.id, id));
      logger.warn('Falha de login administrativo', { adminId: id, attempts });
    },
    async (id) => {
      await db
        .update(adminUsers)
        .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
        .where(eq(adminUsers.id, id));
    },
  );

  return { id: row!.id, name: row!.name, email: row!.email, role: row!.role };
}

export async function getCustomerById(id: string): Promise<PublicUser> {
  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound('Conta não encontrada.');
  return toPublicUser(row);
}

export async function updateCustomerProfile(
  id: string,
  input: { name?: string; phone?: string },
): Promise<PublicUser> {
  const db = getDb();
  const rows = await db
    .update(users)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .returning();
  const row = rows[0];
  if (!row) throw notFound('Conta não encontrada.');
  return toPublicUser(row);
}

export async function changeCustomerPassword(
  id: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw notFound('Conta não encontrada.');
  if (!(await verifyPassword(currentPassword, row.passwordHash))) {
    throw badRequest('Senha atual incorreta.');
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, id));
  await revokeAllSessions('customer', id);
}

/**
 * Sempre responde "enviamos se existir": não confirma se o e-mail está cadastrado.
 * O token puro só sai por e-mail — a API nunca o devolve.
 */
export async function requestPasswordReset(email: string): Promise<{ emailConfigured: boolean }> {
  const db = getDb();
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(sql`lower(${users.email}) = ${email}`, isNull(users.deletedAt)))
    .limit(1);
  const user = rows[0];

  if (user) {
    const token = generateToken(32);
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
    const url = `${env.publicSiteUrl}/conta/redefinir?token=${encodeURIComponent(token)}`;
    const message = renderPasswordResetEmail(user.name, url);
    await sendEmail({ ...message, to: user.email });
  }

  return { emailConfigured: env.emailConfigured };
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, hashToken(token)))
    .limit(1);
  const record = rows[0];
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw badRequest('Link de redefinição inválido ou expirado. Solicite um novo.');
  }

  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, record.id));
    await tx
      .update(users)
      .set({ passwordHash, failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(users.id, record.userId));
  });

  // Trocar a senha encerra todas as sessões antigas.
  await revokeAllSessions('customer', record.userId);
}
