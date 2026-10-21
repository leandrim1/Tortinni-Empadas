import { z } from 'zod';
import { eq, sql, isNull, and } from 'drizzle-orm';
import type { Router, RequestContext } from '../lib/router';
import { created, noContent } from '../lib/router';
import { getDb } from '../lib/db';
import { adminUsers, storeSettings, storeHours, products } from '../../db/schema';
import { parseOrThrow, parseQuery, uuidSchema } from '../validators/common';
import { adminLoginSchema, bootstrapAdminSchema } from '../validators/auth';
import {
  categoryInputSchema,
  categoryReorderSchema,
  productInputSchema,
  deliveryRegionSchema,
  storeSettingsSchema,
  adminUserInputSchema,
  uploadQuerySchema,
} from '../validators/admin';
import { updateOrderStatusSchema, adminOrderFiltersSchema } from '../validators/orders';
import { loginAdmin } from '../services/auth';
import {
  createSession,
  setSessionCookies,
  clearSessionCookies,
  requireAdmin,
  revokeSession,
  resolveSession,
  ADMIN_COOKIE,
} from '../lib/session';
import { enforceRateLimit } from '../lib/rate-limit';
import { listOrdersForAdmin, getOrderDetail, updateOrderStatus } from '../services/orders';
import {
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  createProduct,
  updateProduct,
  archiveProduct,
  restoreProduct,
  setProductAvailability,
  listProductsForAdmin,
  createRegion,
  updateRegion,
  deleteRegion,
  listRegionsForAdmin,
  updateStoreSettings,
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  getDashboardMetrics,
} from '../services/admin';
import { listCategories, listProducts } from '../services/catalog';
import { recordAudit, listAuditLogs } from '../services/audit';
import { uploadImage } from '../services/uploads';
import { readBinaryBody } from '../lib/http';
import { env } from '../lib/env';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { hashPassword, safeEqual } from '../lib/crypto';
import { availablePaymentMethods } from '../services/store';

/** Só o papel "admin" mexe em catálogo, configurações e usuários. */
const ADMIN_ONLY = ['admin'] as const;

export function registerAdminRoutes(router: Router): void {
  /* ───────────────── Sessão administrativa ───────────────── */

  /**
   * Criação do primeiro administrador: exige ADMIN_BOOTSTRAP_TOKEN
   * (definido no servidor) e só funciona enquanto não existir nenhum admin.
   * Nenhuma senha fica fixa no código.
   */
  router.post('/api/admin/bootstrap', async (ctx) => {
    await enforceRateLimit({ key: `bootstrap:${ctx.ip}`, limit: 5, windowSeconds: 3600 });

    const configured = env.adminBootstrapToken;
    if (!configured) {
      throw forbidden('Criação do primeiro administrador desabilitada: defina ADMIN_BOOTSTRAP_TOKEN.');
    }
    const provided = ctx.req.headers['x-admin-bootstrap-token'];
    const token = Array.isArray(provided) ? provided[0] : provided;
    if (!token || !safeEqual(token, configured)) {
      throw forbidden('Token de inicialização inválido.');
    }

    const db = getDb();
    const existing = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(adminUsers)
      .where(isNull(adminUsers.deletedAt));
    if ((existing[0]?.total ?? 0) > 0) {
      throw conflict('Já existe um administrador. Use o login do painel.');
    }

    const input = parseOrThrow(bootstrapAdminSchema, await ctx.json());
    const rows = await db
      .insert(adminUsers)
      .values({
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
        role: 'admin',
      })
      .returning({ id: adminUsers.id, name: adminUsers.name, email: adminUsers.email });

    await recordAudit({
      adminUserId: rows[0]!.id,
      action: 'admin.bootstrap',
      entity: 'admin_user',
      entityId: rows[0]!.id,
      ipAddress: ctx.ip,
    });

    return created({ admin: rows[0] });
  });

  router.get('/api/admin/bootstrap-status', async () => {
    const db = getDb();
    const existing = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(adminUsers)
      .where(isNull(adminUsers.deletedAt));
    return {
      needsBootstrap: (existing[0]?.total ?? 0) === 0,
      bootstrapEnabled: Boolean(env.adminBootstrapToken),
    };
  });

  router.post('/api/admin/login', async (ctx) => {
    const input = parseOrThrow(adminLoginSchema, await ctx.json());
    await enforceRateLimit({ key: `admin-login-ip:${ctx.ip}`, limit: 10, windowSeconds: 900 });
    await enforceRateLimit({ key: `admin-login-user:${input.email}`, limit: 8, windowSeconds: 900 });

    const admin = await loginAdmin(input.email, input.password);
    const session = await createSession('admin', admin.id, {
      ip: ctx.ip,
      userAgent: ctx.req.headers['user-agent'],
    });
    setSessionCookies(ctx, session, 'admin');
    await recordAudit({
      adminUserId: admin.id,
      action: 'admin.login',
      entity: 'admin_user',
      entityId: admin.id,
      ipAddress: ctx.ip,
    });
    return { admin, csrfToken: session.csrfToken };
  });

  router.post('/api/admin/logout', async (ctx) => {
    const auth = await resolveSession(ctx.cookies[ADMIN_COOKIE], 'admin');
    if (auth) await revokeSession(auth.sessionId);
    clearSessionCookies(ctx, 'admin');
    return { ok: true };
  });

  router.get('/api/admin/me', async (ctx) => {
    const auth = await resolveSession(ctx.cookies[ADMIN_COOKIE], 'admin');
    if (!auth) return { admin: null };
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
    if (!admin?.isActive) return { admin: null };
    return { admin, csrfToken: (await import('../lib/session')).csrfTokenFor(auth.csrfSecret) };
  });

  /* ───────────────── Dashboard ───────────────── */

  router.get('/api/admin/dashboard', async (ctx) => {
    await requireAdmin(ctx);
    const query = parseQuery(
      z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() }),
      ctx.query,
    );
    return getDashboardMetrics(query);
  });

  /* ───────────────── Pedidos ───────────────── */

  router.get('/api/admin/orders', async (ctx) => {
    await requireAdmin(ctx);
    const filters = parseQuery(adminOrderFiltersSchema, ctx.query);
    return listOrdersForAdmin(filters);
  });

  router.get('/api/admin/orders/:id', async (ctx) => {
    await requireAdmin(ctx);
    const id = parseOrThrow(uuidSchema, ctx.params.id);
    return { order: await getOrderDetail(id) };
  });

  router.patch('/api/admin/orders/:id/status', async (ctx) => {
    const admin = await requireAdmin(ctx);
    const id = parseOrThrow(uuidSchema, ctx.params.id);
    const input = parseOrThrow(updateOrderStatusSchema, await ctx.json());
    const before = await getOrderDetail(id);
    const order = await updateOrderStatus(id, input.status, {
      adminId: admin.subjectId,
      note: input.note,
      cancelReason: input.cancelReason,
    });
    await recordAudit({
      adminUserId: admin.subjectId,
      action: 'order.status_changed',
      entity: 'order',
      entityId: id,
      before: { status: before.status },
      after: { status: order.status },
      ipAddress: ctx.ip,
    });
    return { order };
  });

  /* ───────────────── Catálogo ───────────────── */

  router.get('/api/admin/categories', async (ctx) => {
    await requireAdmin(ctx);
    return { categories: await listCategories(false) };
  });

  router.post('/api/admin/categories', async (ctx) => {
    const admin = await requireAdmin(ctx, ADMIN_ONLY);
    const input = parseOrThrow(categoryInputSchema, await ctx.json());
    const category = await createCategory(input);
    await recordAudit({
      adminUserId: admin.subjectId,
      action: 'category.created',
      entity: 'category',
      entityId: category.id,
      after: category,
      ipAddress: ctx.ip,
    });
    return created({ category });
  });

  router.patch('/api/admin/categories/:id', async (ctx) => {
    const admin = await requireAdmin(ctx, ADMIN_ONLY);
    const id = parseOrThrow(uuidSchema, ctx.params.id);
    const input = parseOrThrow(categoryInputSchema, await ctx.json());
    const category = await updateCategory(id, input);
    await recordAudit({
      adminUserId: admin.subjectId,
      action: 'category.updated',
      entity: 'category',
      entityId: id,
      after: category,
      ipAddress: ctx.ip,
    });
    return { category };
  });

  router.post('/api/admin/categories/reorder', async (ctx) => {
    const admin = await requireAdmin(ctx, ADMIN_ONLY);
    const input = parseOrThrow(categoryReorderSchema, await ctx.json());
    await reorderCategories(input.order);
    await recordAudit({
      adminUserId: admin.subjectId,
      action: 'category.reordered',
      entity: 'category',
      ipAddress: ctx.ip,
    });
    return { ok: true };
  });

  router.delete('/api/admin/categories/:id', async (ctx) => {
    const admin = await requireAdmin(ctx, ADMIN_ONLY);
    const id = parseOrThrow(uuidSchema, ctx.params.id);
    await deleteCategory(id);
    await recordAudit({
      adminUserId: admin.subjectId,
      action: 'category.deleted',
      entity: 'category',
      entityId: id,
      ipAddress: ctx.ip,
    });
    return noContent();
  });

  router.get('/api/admin/products', async (ctx) => {
    await requireAdmin(ctx);
    const query = parseQuery(
      z.object({
        includeArchived: z.enum(['true', 'false']).default('false'),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
      }),
      ctx.query,
    );
    return listProductsForAdmin({
      includeArchived: query.includeArchived === 'true',
      page: query.page,
      pageSize: query.pageSize,
    });
  });

  /** Detalhe com combos resolvidos, para o formulário de edição. */
  router.get('/api/admin/products/:id', async (ctx) => {
    await requireAdmin(ctx);
    const id = parseOrThrow(uuidSchema, ctx.params.id);
    const db = getDb();
    const rows = await db.select({ slug: products.slug }).from(products).where(eq(products.id, id)).limit(1);
    if (!rows[0]) throw notFound('Produto não encontrado.');
    const page = await listProducts({ pageSize: 100, includeUnavailable: true });
    const product = page.items.find((item) => item.id === id);
    if (!product) throw notFound('Produto não encontrado.');
    return { product };
  });

  router.post('/api/admin/products', async (ctx) => {
    const admin = await requireAdmin(ctx, ADMIN_ONLY);
    const input = parseOrThrow(productInputSchema, await ctx.json());
    const product = await createProduct(input);
    await recordAudit({
      adminUserId: admin.subjectId,
      action: 'product.created',
      entity: 'product',
      entityId: product.id,
      after: { name: product.name, priceCents: product.priceCents },
      ipAddress: ctx.ip,
    });
    return created({ product });
  });

  router.patch('/api/admin/products/:id', async (ctx) => {
    const admin = await requireAdmin(ctx, ADMIN_ONLY);
    const id = parseOrThrow(uuidSchema, ctx.params.id);
    const input = parseOrThrow(productInputSchema, await ctx.json());
    const product = await updateProduct(id, input);
    await recordAudit({
      adminUserId: admin.subjectId,
      action: 'product.updated',
      entity: 'product',
      entityId: id,
      after: { name: product.name, priceCents: product.priceCents },
      ipAddress: ctx.ip,
    });
    return { product };
  });

  /** Operador pode ligar/desligar a disponibilidade durante o expediente. */
  router.patch('/api/admin/products/:id/availability', async (ctx) => {
    const admin = await requireAdmin(ctx);
    const id = parseOrThrow(uuidSchema, ctx.params.id);
    const input = parseOrThrow(z.object({ isAvailable: z.boolean() }), await ctx.json());
    const product = await setProductAvailability(id, input.isAvailable);
    await recordAudit({
      adminUserId: admin.subjectId,
      action: 'product.availability_changed',
      entity: 'product',
      entityId: id,
      after: product,
      ipAddress: ctx.ip,
    });
    return { product };
  });

  router.delete('/api/admin/products/:id', async (ctx) => {
    const admin = await requireAdmin(ctx, ADMIN_ONLY);
    const id = parseOrThrow(uuidSchema, ctx.params.id);
    const product = await archiveProduct(id);
    await recordAudit({
      adminUserId: admin.subjectId,
      action: 'product.archived',
      entity: 'product',
      entityId: id,
      before: product,
      ipAddress: ctx.ip,
    });
    return noContent();
  });

  router.post('/api/admin/products/:id/restore', async (ctx) => {
    const admin = await requireAdmin(ctx, ADMIN_ONLY);
    const id = parseOrThrow(uuidSchema, ctx.params.id);
    await restoreProduct(id);
    await recordAudit({
      adminUserId: admin.subjectId,
      action: 'product.restored',
      entity: 'product',
      entityId: id,
      ipAddress: ctx.ip,
    });
    return { ok: true };
  });

  /* ───────────────── Upload de imagens ───────────────── */

  /**
   * Upload binário direto: o corpo é a imagem, o nome vem na query.
   * O token do Blob fica só no servidor.
   */
  router.put('/api/admin/uploads', async (ctx: RequestContext) => {
    const admin = await requireAdmin(ctx, ADMIN_ONLY);
    const query = parseQuery(uploadQuerySchema, ctx.query);
    const buffer = await readBinaryBody(ctx.req);
    const contentType = ctx.req.headers['content-type'];

    const result = await uploadImage(buffer, {
      filename: query.filename,
      folder: query.folder,
      declaredType: Array.isArray(contentType) ? contentType[0] : contentType,
    });

    await recordAudit({
      adminUserId: admin.subjectId,
      action: 'image.uploaded',
      entity: 'blob',
      entityId: result.pathname,
      after: { url: result.url, size: result.size },
      ipAddress: ctx.ip,
    });
    return created(result);
  });

  /* ───────────────── Regiões de entrega ───────────────── */

  router.get('/api/admin/regions', async (ctx) => {
    await requireAdmin(ctx);
    return { regions: await listRegionsForAdmin() };
  });

  router.post('/api/admin/regions', async (ctx) => {
    const admin = await requireAdmin(ctx, ADMIN_ONLY);
    const input = parseOrThrow(deliveryRegionSchema, await ctx.json());
    const region = await createRegion(input);
    await recordAudit({
      adminUserId: admin.subjectId,
      action: 'region.created',
      entity: 'delivery_region',
      entityId: region.id,
      after: region,
      ipAddress: ctx.ip,
    });
    return created({ region });
  });

  router.patch('/api/admin/regions/:id', async (ctx) => {
    const admin = await requireAdmin(ctx, ADMIN_ONLY);
    const id = parseOrThrow(uuidSchema, ctx.params.id);
    const input = parseOrThrow(deliveryRegionSchema, await ctx.json());
    const region = await updateRegion(id, input);
    await recordAudit({
      adminUserId: admin.subjectId,
      action: 'region.updated',
      entity: 'delivery_region',
      entityId: id,
      after: region,
      ipAddress: ctx.ip,
    });
    return { region };
  });

  router.delete('/api/admin/regions/:id', async (ctx) => {
    const admin = await requireAdmin(ctx, ADMIN_ONLY);
    const id = parseOrThrow(uuidSchema, ctx.params.id);
    await deleteRegion(id);
    await recordAudit({
      adminUserId: admin.subjectId,
      action: 'region.deleted',
      entity: 'delivery_region',
      entityId: id,
      ipAddress: ctx.ip,
    });
    return noContent();
  });

  /* ───────────────── Configurações ───────────────── */

  router.get('/api/admin/settings', async (ctx) => {
    await requireAdmin(ctx);
    const db = getDb();
    const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.id, 'singleton')).limit(1);
    if (!settings) throw notFound('Configuração da loja não encontrada.');
    const hours = await db.select().from(storeHours).orderBy(storeHours.weekday);
    return {
      settings,
      hours,
      paymentMethods: availablePaymentMethods(settings),
      integrations: {
        onlinePayment: env.onlinePaymentConfigured,
        imageStorage: env.blobConfigured,
        email: env.emailConfigured,
      },
    };
  });

  router.patch('/api/admin/settings', async (ctx) => {
    const admin = await requireAdmin(ctx, ADMIN_ONLY);
    const input = parseOrThrow(storeSettingsSchema, await ctx.json());
    const settings = await updateStoreSettings(input);
    await recordAudit({
      adminUserId: admin.subjectId,
      action: 'settings.updated',
      entity: 'store_settings',
      entityId: 'singleton',
      after: input,
      ipAddress: ctx.ip,
    });
    return { settings };
  });

  /** Atalho para fechar/abrir a loja sem abrir a tela de configurações. */
  router.post('/api/admin/settings/toggle-open', async (ctx) => {
    const admin = await requireAdmin(ctx);
    const input = parseOrThrow(
      z.object({ manuallyClosed: z.boolean(), closedMessage: z.string().trim().max(240).optional() }),
      await ctx.json(),
    );
    const db = getDb();
    const rows = await db
      .update(storeSettings)
      .set({
        manuallyClosed: input.manuallyClosed,
        closedMessage: input.closedMessage ?? null,
        updatedAt: new Date(),
      })
      .where(eq(storeSettings.id, 'singleton'))
      .returning({ manuallyClosed: storeSettings.manuallyClosed });
    await recordAudit({
      adminUserId: admin.subjectId,
      action: 'settings.toggle_open',
      entity: 'store_settings',
      entityId: 'singleton',
      after: input,
      ipAddress: ctx.ip,
    });
    return { settings: rows[0] };
  });

  /* ───────────────── Usuários administrativos ───────────────── */

  router.get('/api/admin/users', async (ctx) => {
    await requireAdmin(ctx, ADMIN_ONLY);
    return { users: await listAdminUsers() };
  });

  router.post('/api/admin/users', async (ctx) => {
    const admin = await requireAdmin(ctx, ADMIN_ONLY);
    const input = parseOrThrow(adminUserInputSchema, await ctx.json());
    if (!input.password) throw badRequest('Informe uma senha para o novo usuário.');
    const user = await createAdminUser(input);
    await recordAudit({
      adminUserId: admin.subjectId,
      action: 'admin_user.created',
      entity: 'admin_user',
      entityId: user.id,
      after: { email: user.email, role: user.role },
      ipAddress: ctx.ip,
    });
    return created({ user });
  });

  router.patch('/api/admin/users/:id', async (ctx) => {
    const admin = await requireAdmin(ctx, ADMIN_ONLY);
    const id = parseOrThrow(uuidSchema, ctx.params.id);
    const input = parseOrThrow(adminUserInputSchema, await ctx.json());
    const user = await updateAdminUser(id, input, admin.subjectId);
    await recordAudit({
      adminUserId: admin.subjectId,
      action: 'admin_user.updated',
      entity: 'admin_user',
      entityId: id,
      after: { email: user.email, role: user.role },
      ipAddress: ctx.ip,
    });
    return { user };
  });

  router.delete('/api/admin/users/:id', async (ctx) => {
    const admin = await requireAdmin(ctx, ADMIN_ONLY);
    const id = parseOrThrow(uuidSchema, ctx.params.id);
    await deleteAdminUser(id, admin.subjectId);
    await recordAudit({
      adminUserId: admin.subjectId,
      action: 'admin_user.deleted',
      entity: 'admin_user',
      entityId: id,
      ipAddress: ctx.ip,
    });
    return noContent();
  });

  router.get('/api/admin/audit', async (ctx) => {
    await requireAdmin(ctx, ADMIN_ONLY);
    const query = parseQuery(
      z.object({
        entity: z.string().trim().max(60).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
      }),
      ctx.query,
    );
    return { items: await listAuditLogs(query) };
  });
}
