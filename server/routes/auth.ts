import { z } from 'zod';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Router } from '../lib/router';
import { created, noContent } from '../lib/router';
import { getDb } from '../lib/db';
import { userAddresses } from '../../db/schema';
import { parseOrThrow, uuidSchema } from '../validators/common';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  updateProfileSchema,
  changePasswordSchema,
  addressSchema,
} from '../validators/auth';
import {
  registerCustomer,
  loginCustomer,
  getCustomerById,
  updateCustomerProfile,
  changeCustomerPassword,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from '../services/auth';
import {
  createSession,
  setSessionCookies,
  clearSessionCookies,
  requireCustomer,
  withCustomer,
  revokeSession,
  CUSTOMER_COOKIE,
  resolveSession,
} from '../lib/session';
import { enforceRateLimit } from '../lib/rate-limit';
import { listCustomerOrders, getOrderForCustomer } from '../services/orders';
import { notFound } from '../lib/errors';

export function registerAuthRoutes(router: Router): void {
  router.post('/api/auth/register', async (ctx) => {
    await enforceRateLimit({ key: `register:${ctx.ip}`, limit: 5, windowSeconds: 3600 });
    const input = parseOrThrow(registerSchema, await ctx.json());
    const { user, verificationSent } = await registerCustomer(input);

    const session = await createSession('customer', user.id, {
      ip: ctx.ip,
      userAgent: ctx.req.headers['user-agent'],
    });
    setSessionCookies(ctx, session, 'customer');

    return created({ user, verificationSent, csrfToken: session.csrfToken });
  });

  router.post('/api/auth/login', async (ctx) => {
    const input = parseOrThrow(loginSchema, await ctx.json());
    // Dois baldes: por IP (rajada) e por conta (força bruta distribuída).
    await enforceRateLimit({ key: `login-ip:${ctx.ip}`, limit: 15, windowSeconds: 900 });
    await enforceRateLimit({ key: `login-user:${input.email}`, limit: 10, windowSeconds: 900 });

    const user = await loginCustomer(input.email, input.password);
    const session = await createSession('customer', user.id, {
      ip: ctx.ip,
      userAgent: ctx.req.headers['user-agent'],
    });
    setSessionCookies(ctx, session, 'customer');
    return { user, csrfToken: session.csrfToken };
  });

  router.post('/api/auth/logout', async (ctx) => {
    const auth = await withCustomer(ctx);
    if (auth) await revokeSession(auth.sessionId);
    clearSessionCookies(ctx, 'customer');
    return { ok: true };
  });

  router.get('/api/auth/me', async (ctx) => {
    const auth = await resolveSession(ctx.cookies[CUSTOMER_COOKIE], 'customer');
    if (!auth) return { user: null };
    try {
      return { user: await getCustomerById(auth.subjectId) };
    } catch {
      return { user: null };
    }
  });

  router.patch('/api/auth/me', async (ctx) => {
    const auth = await requireCustomer(ctx);
    const input = parseOrThrow(updateProfileSchema, await ctx.json());
    return { user: await updateCustomerProfile(auth.subjectId, input) };
  });

  router.post('/api/auth/password/change', async (ctx) => {
    const auth = await requireCustomer(ctx);
    const input = parseOrThrow(changePasswordSchema, await ctx.json());
    await changeCustomerPassword(auth.subjectId, input.currentPassword, input.newPassword);
    clearSessionCookies(ctx, 'customer');
    return { ok: true, message: 'Senha alterada. Entre novamente.' };
  });

  router.post('/api/auth/password/forgot', async (ctx) => {
    const input = parseOrThrow(forgotPasswordSchema, await ctx.json());
    await enforceRateLimit({ key: `forgot:${ctx.ip}`, limit: 5, windowSeconds: 900 });
    const { emailConfigured } = await requestPasswordReset(input.email);
    // Resposta idêntica exista ou não a conta.
    return {
      ok: true,
      emailConfigured,
      message: emailConfigured
        ? 'Se existir uma conta com este e-mail, enviamos o link de redefinição.'
        : 'Envio de e-mail ainda não configurado nesta loja. Fale com o atendimento para recuperar o acesso.',
    };
  });

  router.post('/api/auth/password/reset', async (ctx) => {
    await enforceRateLimit({ key: `reset:${ctx.ip}`, limit: 10, windowSeconds: 900 });
    const input = parseOrThrow(resetPasswordSchema, await ctx.json());
    await resetPassword(input.token, input.password);
    return { ok: true, message: 'Senha redefinida. Entre com a nova senha.' };
  });

  router.post('/api/auth/email/verify', async (ctx) => {
    const input = parseOrThrow(verifyEmailSchema, await ctx.json());
    await verifyEmail(input.token);
    return { ok: true };
  });

  /* ───────────────── Endereços salvos ───────────────── */

  router.get('/api/auth/addresses', async (ctx) => {
    const auth = await requireCustomer(ctx);
    const db = getDb();
    const items = await db
      .select()
      .from(userAddresses)
      .where(and(eq(userAddresses.userId, auth.subjectId), isNull(userAddresses.deletedAt)))
      .orderBy(asc(userAddresses.createdAt));
    return { items };
  });

  router.post('/api/auth/addresses', async (ctx) => {
    const auth = await requireCustomer(ctx);
    const input = parseOrThrow(addressSchema, await ctx.json());
    const db = getDb();

    if (input.isDefault) {
      await db
        .update(userAddresses)
        .set({ isDefault: false })
        .where(eq(userAddresses.userId, auth.subjectId));
    }
    const rows = await db
      .insert(userAddresses)
      .values({
        userId: auth.subjectId,
        label: input.label ?? null,
        street: input.street,
        number: input.number,
        complement: input.complement ?? null,
        neighborhood: input.neighborhood,
        city: input.city,
        state: input.state ?? null,
        postalCode: input.postalCode || null,
        reference: input.reference ?? null,
        isDefault: input.isDefault ?? false,
      })
      .returning();
    return created({ address: rows[0] });
  });

  router.delete('/api/auth/addresses/:id', async (ctx) => {
    const auth = await requireCustomer(ctx);
    const id = parseOrThrow(uuidSchema, ctx.params.id);
    const db = getDb();
    const rows = await db
      .update(userAddresses)
      .set({ deletedAt: new Date() })
      .where(and(eq(userAddresses.id, id), eq(userAddresses.userId, auth.subjectId)))
      .returning({ id: userAddresses.id });
    if (!rows[0]) throw notFound('Endereço não encontrado.');
    return noContent();
  });

  /* ───────────────── Pedidos do cliente ───────────────── */

  router.get('/api/auth/orders', async (ctx) => {
    const auth = await requireCustomer(ctx);
    const query = z
      .object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(10) })
      .parse({ page: ctx.query.get('page') ?? undefined, pageSize: ctx.query.get('pageSize') ?? undefined });
    return listCustomerOrders(auth.subjectId, query.page, query.pageSize);
  });

  router.get('/api/auth/orders/:id', async (ctx) => {
    const auth = await requireCustomer(ctx);
    const id = parseOrThrow(uuidSchema, ctx.params.id);
    return { order: await getOrderForCustomer(id, auth.subjectId) };
  });
}
