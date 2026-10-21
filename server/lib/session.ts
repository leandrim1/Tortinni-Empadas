import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb } from './db';
import { sessions, users, adminUsers } from '../../db/schema';
import { generateToken, hashToken, hmac, safeEqual } from './crypto';
import { env } from './env';
import { forbidden, unauthorized } from './errors';
import type { RequestContext, AuthContext } from './router';

export const CUSTOMER_COOKIE = 'tortinni_session';
export const ADMIN_COOKIE = 'tortinni_admin_session';
export const CSRF_COOKIE = 'tortinni_csrf';

const CUSTOMER_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dias
const ADMIN_TTL_SECONDS = 60 * 60 * 12; // 12 horas

export interface CreatedSession {
  token: string;
  csrfToken: string;
  expiresAt: Date;
}

export async function createSession(
  subjectType: 'customer' | 'admin',
  subjectId: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<CreatedSession> {
  const db = getDb();
  const token = generateToken(32);
  const csrfSecret = generateToken(32);
  const ttl = subjectType === 'admin' ? ADMIN_TTL_SECONDS : CUSTOMER_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttl * 1000);

  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    subjectType,
    subjectId,
    csrfSecret,
    ipAddress: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    expiresAt,
  });

  return { token, csrfToken: csrfTokenFor(csrfSecret), expiresAt };
}

/** O token CSRF é derivado do segredo da sessão — não precisa ser guardado. */
export function csrfTokenFor(csrfSecret: string): string {
  return hmac(env.sessionSecret, csrfSecret);
}

export async function resolveSession(
  token: string | undefined,
  subjectType: 'customer' | 'admin',
): Promise<AuthContext | undefined> {
  if (!token) return undefined;
  const db = getDb();
  const rows = await db
    .select({
      id: sessions.id,
      subjectType: sessions.subjectType,
      subjectId: sessions.subjectId,
      csrfSecret: sessions.csrfSecret,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        eq(sessions.subjectType, subjectType),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;
  return {
    sessionId: row.id,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    csrfSecret: row.csrfSecret,
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  const db = getDb();
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export async function revokeAllSessions(subjectType: 'customer' | 'admin', subjectId: string): Promise<void> {
  const db = getDb();
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.subjectType, subjectType), eq(sessions.subjectId, subjectId), isNull(sessions.revokedAt)));
}

export async function pruneSessions(): Promise<void> {
  const db = getDb();
  await db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, new Date()), sql`${sessions.revokedAt} < now() - interval '7 days'`));
}

export function setSessionCookies(ctx: RequestContext, session: CreatedSession, subjectType: 'customer' | 'admin') {
  const maxAge = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
  ctx.setCookie({
    name: subjectType === 'admin' ? ADMIN_COOKIE : CUSTOMER_COOKIE,
    value: session.token,
    httpOnly: true,
    sameSite: 'Lax',
    secure: env.isProduction,
    maxAge,
    path: '/',
  });
  // Cookie legível pelo JS apenas para ecoar o token no header (double submit).
  ctx.setCookie({
    name: CSRF_COOKIE,
    value: session.csrfToken,
    httpOnly: false,
    sameSite: 'Lax',
    secure: env.isProduction,
    maxAge,
    path: '/',
  });
}

export function clearSessionCookies(ctx: RequestContext, subjectType: 'customer' | 'admin') {
  ctx.setCookie({
    name: subjectType === 'admin' ? ADMIN_COOKIE : CUSTOMER_COOKIE,
    value: '',
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'Lax',
    secure: env.isProduction,
  });
  ctx.setCookie({
    name: CSRF_COOKIE,
    value: '',
    httpOnly: false,
    maxAge: 0,
    path: '/',
    sameSite: 'Lax',
    secure: env.isProduction,
  });
}

/**
 * Double-submit cookie: o header precisa bater com o token derivado do
 * segredo guardado na sessão. Métodos de leitura ficam de fora.
 */
export function assertCsrf(ctx: RequestContext): void {
  if (ctx.method === 'GET') return;
  const auth = ctx.auth;
  if (!auth) return; // Rotas anônimas não têm sessão para proteger.
  const header = ctx.req.headers['x-csrf-token'];
  const provided = Array.isArray(header) ? header[0] : header;
  if (!provided || !safeEqual(provided, csrfTokenFor(auth.csrfSecret))) {
    throw forbidden('Token CSRF ausente ou inválido. Recarregue a página e tente novamente.');
  }
}

/** Resolve (sem exigir) a sessão do cliente. */
export async function withCustomer(ctx: RequestContext): Promise<AuthContext | undefined> {
  const auth = await resolveSession(ctx.cookies[CUSTOMER_COOKIE], 'customer');
  if (auth) ctx.auth = auth;
  return auth;
}

export async function requireCustomer(ctx: RequestContext): Promise<AuthContext> {
  const auth = await withCustomer(ctx);
  if (!auth) throw unauthorized();
  const db = getDb();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, auth.subjectId), isNull(users.deletedAt)))
    .limit(1);
  if (!rows[0]) throw unauthorized();
  assertCsrf(ctx);
  return auth;
}

export interface AdminPrincipal extends AuthContext {
  role: 'admin' | 'operator';
  name: string;
  email: string;
}

/**
 * Autorização de verdade: valida sessão, conta ativa e papel no servidor.
 * Esconder botões no front não é controle de acesso.
 */
export async function requireAdmin(
  ctx: RequestContext,
  roles: readonly ('admin' | 'operator')[] = ['admin', 'operator'],
): Promise<AdminPrincipal> {
  const auth = await resolveSession(ctx.cookies[ADMIN_COOKIE], 'admin');
  if (!auth) throw unauthorized('Faça login no painel administrativo.');
  ctx.auth = auth;

  const db = getDb();
  const rows = await db
    .select({
      id: adminUsers.id,
      name: adminUsers.name,
      email: adminUsers.email,
      role: adminUsers.role,
      isActive: adminUsers.isActive,
    })
    .from(adminUsers)
    .where(and(eq(adminUsers.id, auth.subjectId), isNull(adminUsers.deletedAt)))
    .limit(1);

  const admin = rows[0];
  if (!admin || !admin.isActive) {
    await revokeSession(auth.sessionId);
    throw unauthorized('Sessão administrativa inválida.');
  }
  if (!roles.includes(admin.role)) {
    throw forbidden('Seu perfil não tem permissão para esta ação.');
  }
  assertCsrf(ctx);
  return { ...auth, role: admin.role, name: admin.name, email: admin.email };
}
