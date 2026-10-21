import { and, asc, desc, eq, gte, isNull, lte, ne, sql } from 'drizzle-orm';
import { getDb, type Database } from '../lib/db';
import {
  categories,
  products,
  productVariants,
  combos,
  comboGroups,
  comboOptions,
  storeSettings,
  storeHours,
  deliveryRegions,
  adminUsers,
  orders,
  orderItems,
} from '../../db/schema';
import { buildSearchText, slugify } from './catalog';
import { normalizeNeighborhood } from './store';
import { badRequest, conflict, notFound } from '../lib/errors';
import { hashPassword } from '../lib/crypto';
import type { ProductInput, CategoryInput, StoreSettingsInput } from '../validators/admin';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/* ───────────────────────────── Categorias ───────────────────────────── */

async function ensureUniqueSlug(
  table: typeof categories | typeof products,
  desired: string,
  excludeId?: string,
): Promise<string> {
  const db = getDb();
  let slug = desired;
  for (let i = 1; i <= 50; i++) {
    const rows = await db
      .select({ id: table.id })
      .from(table)
      .where(excludeId ? and(eq(table.slug, slug), ne(table.id, excludeId)) : eq(table.slug, slug))
      .limit(1);
    if (!rows[0]) return slug;
    slug = `${desired}-${i + 1}`;
  }
  throw conflict('Não foi possível gerar um identificador único.');
}

export async function createCategory(input: CategoryInput) {
  const db = getDb();
  const slug = await ensureUniqueSlug(categories, input.slug ?? slugify(input.name));
  const rows = await db
    .insert(categories)
    .values({
      name: input.name,
      slug,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    })
    .returning();
  return rows[0]!;
}

export async function updateCategory(id: string, input: CategoryInput) {
  const db = getDb();
  const slug = input.slug ? await ensureUniqueSlug(categories, input.slug, id) : undefined;
  const rows = await db
    .update(categories)
    .set({
      name: input.name,
      ...(slug ? { slug } : {}),
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
    .returning();
  const row = rows[0];
  if (!row) throw notFound('Categoria não encontrada.');
  await refreshSearchTextForCategory(id);
  return row;
}

/**
 * Exclusão lógica, protegendo os produtos vinculados: só apaga a categoria
 * quando ela está vazia, senão exige que o administrador mova os produtos.
 */
export async function deleteCategory(id: string) {
  const db = getDb();
  const linked = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.categoryId, id), isNull(products.deletedAt)));

  if ((linked[0]?.total ?? 0) > 0) {
    throw conflict(
      `Esta categoria tem ${linked[0]!.total} produto(s). Mova-os para outra categoria antes de excluir.`,
    );
  }

  const rows = await db
    .update(categories)
    .set({ deletedAt: new Date(), isActive: false })
    .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
    .returning({ id: categories.id });
  if (!rows[0]) throw notFound('Categoria não encontrada.');
}

export async function reorderCategories(order: { id: string; sortOrder: number }[]) {
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const entry of order) {
      await tx.update(categories).set({ sortOrder: entry.sortOrder }).where(eq(categories.id, entry.id));
    }
  });
}

/* ───────────────────────────── Produtos ───────────────────────────── */

async function refreshSearchTextForCategory(categoryId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: products.id, name: products.name, description: products.description })
    .from(products)
    .where(eq(products.categoryId, categoryId));
  const category = await db
    .select({ name: categories.name })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  const categoryName = category[0]?.name ?? '';
  for (const row of rows) {
    await db
      .update(products)
      .set({ searchText: buildSearchText([row.name, row.description, categoryName]) })
      .where(eq(products.id, row.id));
  }
}

async function categoryNameFor(categoryId: string | null | undefined): Promise<string> {
  if (!categoryId) return '';
  const db = getDb();
  const rows = await db
    .select({ name: categories.name })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  return rows[0]?.name ?? '';
}

async function saveComboStructure(tx: Transaction, productId: string, combo: NonNullable<ProductInput['combo']>) {
  const existing = await tx.select({ id: combos.id }).from(combos).where(eq(combos.productId, productId)).limit(1);
  // Recria a estrutura: grupos e opções caem em cascata.
  if (existing[0]) await tx.delete(combos).where(eq(combos.id, existing[0].id));

  const inserted = await tx
    .insert(combos)
    .values({ productId, instructions: combo.instructions ?? null })
    .returning({ id: combos.id });
  const comboId = inserted[0]!.id;

  for (const [groupIndex, group] of combo.groups.entries()) {
    const groupRows = await tx
      .insert(comboGroups)
      .values({
        comboId,
        title: group.title,
        helpText: group.helpText ?? null,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        allowRepeat: group.allowRepeat ?? true,
        sortOrder: group.sortOrder ?? groupIndex,
      })
      .returning({ id: comboGroups.id });
    const groupId = groupRows[0]!.id;

    const seen = new Set<string>();
    const values = group.options
      .filter((option) => {
        if (seen.has(option.productId)) return false;
        seen.add(option.productId);
        return true;
      })
      .map((option, index) => ({
        groupId,
        productId: option.productId,
        extraPriceCents: option.extraPriceCents ?? 0,
        isAvailable: option.isAvailable ?? true,
        sortOrder: option.sortOrder ?? index,
      }));
    if (values.length > 0) await tx.insert(comboOptions).values(values);
  }
}

export async function createProduct(input: ProductInput) {
  const db = getDb();
  const slug = await ensureUniqueSlug(products, input.slug ?? slugify(input.name));
  const categoryName = await categoryNameFor(input.categoryId);

  return db.transaction(async (tx) => {
    const rows = await tx
      .insert(products)
      .values({
        name: input.name,
        slug,
        description: input.description ?? null,
        searchText: buildSearchText([input.name, input.description, categoryName]),
        categoryId: input.categoryId ?? null,
        priceCents: input.priceCents,
        promoPriceCents: input.promoPriceCents ?? null,
        promoStartsAt: input.promoStartsAt ? new Date(input.promoStartsAt) : null,
        promoEndsAt: input.promoEndsAt ? new Date(input.promoEndsAt) : null,
        kind: input.kind ?? 'simple',
        imageUrl: input.imageUrl ?? null,
        imageAlt: input.imageAlt ?? null,
        isAvailable: input.isAvailable ?? true,
        isFeatured: input.isFeatured ?? false,
        needsReview: input.needsReview ?? false,
        serves: input.serves ?? null,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();
    const product = rows[0]!;

    if (input.variants?.length) {
      await tx.insert(productVariants).values(
        input.variants.map((variant, index) => ({
          productId: product.id,
          name: variant.name,
          priceDeltaCents: variant.priceDeltaCents,
          isAvailable: variant.isAvailable ?? true,
          sortOrder: variant.sortOrder ?? index,
        })),
      );
    }
    if (input.kind === 'combo' && input.combo) {
      await saveComboStructure(tx, product.id, input.combo);
    }
    return product;
  });
}

export async function updateProduct(id: string, input: ProductInput) {
  const db = getDb();
  const slug = input.slug ? await ensureUniqueSlug(products, input.slug, id) : undefined;
  const categoryName = await categoryNameFor(input.categoryId);

  return db.transaction(async (tx) => {
    const rows = await tx
      .update(products)
      .set({
        name: input.name,
        ...(slug ? { slug } : {}),
        description: input.description ?? null,
        searchText: buildSearchText([input.name, input.description, categoryName]),
        categoryId: input.categoryId ?? null,
        priceCents: input.priceCents,
        promoPriceCents: input.promoPriceCents ?? null,
        promoStartsAt: input.promoStartsAt ? new Date(input.promoStartsAt) : null,
        promoEndsAt: input.promoEndsAt ? new Date(input.promoEndsAt) : null,
        kind: input.kind ?? 'simple',
        imageUrl: input.imageUrl ?? null,
        imageAlt: input.imageAlt ?? null,
        isAvailable: input.isAvailable ?? true,
        isFeatured: input.isFeatured ?? false,
        ...(input.needsReview !== undefined ? { needsReview: input.needsReview } : {}),
        serves: input.serves ?? null,
        sortOrder: input.sortOrder ?? 0,
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, id), isNull(products.deletedAt)))
      .returning();
    const product = rows[0];
    if (!product) throw notFound('Produto não encontrado.');

    if (input.variants) {
      await tx.delete(productVariants).where(eq(productVariants.productId, id));
      if (input.variants.length > 0) {
        await tx.insert(productVariants).values(
          input.variants.map((variant, index) => ({
            productId: id,
            name: variant.name,
            priceDeltaCents: variant.priceDeltaCents,
            isAvailable: variant.isAvailable ?? true,
            sortOrder: variant.sortOrder ?? index,
          })),
        );
      }
    }

    if (input.kind === 'combo' && input.combo) {
      await saveComboStructure(tx, id, input.combo);
    } else if (input.kind === 'simple') {
      await tx.delete(combos).where(eq(combos.productId, id));
    }

    return product;
  });
}

/** Arquivamento: preserva o histórico de pedidos que referencia o produto. */
export async function archiveProduct(id: string) {
  const db = getDb();
  const rows = await db
    .update(products)
    .set({ deletedAt: new Date(), isAvailable: false, isFeatured: false, updatedAt: new Date() })
    .where(and(eq(products.id, id), isNull(products.deletedAt)))
    .returning({ id: products.id, name: products.name });
  if (!rows[0]) throw notFound('Produto não encontrado.');
  return rows[0];
}

export async function restoreProduct(id: string) {
  const db = getDb();
  const rows = await db
    .update(products)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning({ id: products.id });
  if (!rows[0]) throw notFound('Produto não encontrado.');
  return rows[0];
}

export async function setProductAvailability(id: string, isAvailable: boolean) {
  const db = getDb();
  const rows = await db
    .update(products)
    .set({ isAvailable, updatedAt: new Date() })
    .where(and(eq(products.id, id), isNull(products.deletedAt)))
    .returning({ id: products.id, isAvailable: products.isAvailable });
  if (!rows[0]) throw notFound('Produto não encontrado.');
  return rows[0];
}

export async function listProductsForAdmin(options: { includeArchived?: boolean; page: number; pageSize: number }) {
  const db = getDb();
  const where = options.includeArchived ? undefined : isNull(products.deletedAt);
  const [countRow] = await db.select({ total: sql<number>`count(*)::int` }).from(products).where(where);
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      priceCents: products.priceCents,
      promoPriceCents: products.promoPriceCents,
      kind: products.kind,
      isAvailable: products.isAvailable,
      isFeatured: products.isFeatured,
      needsReview: products.needsReview,
      imageUrl: products.imageUrl,
      sortOrder: products.sortOrder,
      deletedAt: products.deletedAt,
      categoryId: products.categoryId,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(where)
    .orderBy(asc(categories.sortOrder), asc(products.sortOrder), asc(products.name))
    .limit(options.pageSize)
    .offset((options.page - 1) * options.pageSize);

  const total = countRow?.total ?? 0;
  return { items: rows, total, page: options.page, pageSize: options.pageSize, hasMore: options.page * options.pageSize < total };
}

/* ───────────────────────── Regiões de entrega ───────────────────────── */

export async function createRegion(input: {
  name: string;
  city?: string;
  feeCents: number;
  minOrderCents?: number | null;
  etaMinMinutes?: number | null;
  etaMaxMinutes?: number | null;
  isActive?: boolean;
  sortOrder?: number;
}) {
  const db = getDb();
  const key = normalizeNeighborhood(input.name);
  const existing = await db
    .select({ id: deliveryRegions.id })
    .from(deliveryRegions)
    .where(eq(deliveryRegions.neighborhoodKey, key))
    .limit(1);
  if (existing[0]) throw conflict('Já existe uma região cadastrada com este bairro.');

  const rows = await db
    .insert(deliveryRegions)
    .values({
      name: input.name,
      neighborhoodKey: key,
      city: input.city ?? '—',
      feeCents: input.feeCents,
      minOrderCents: input.minOrderCents ?? null,
      etaMinMinutes: input.etaMinMinutes ?? null,
      etaMaxMinutes: input.etaMaxMinutes ?? null,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();
  return rows[0]!;
}

export async function updateRegion(id: string, input: Parameters<typeof createRegion>[0]) {
  const db = getDb();
  const rows = await db
    .update(deliveryRegions)
    .set({
      name: input.name,
      neighborhoodKey: normalizeNeighborhood(input.name),
      city: input.city ?? '—',
      feeCents: input.feeCents,
      minOrderCents: input.minOrderCents ?? null,
      etaMinMinutes: input.etaMinMinutes ?? null,
      etaMaxMinutes: input.etaMaxMinutes ?? null,
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(deliveryRegions.id, id), isNull(deliveryRegions.deletedAt)))
    .returning();
  const row = rows[0];
  if (!row) throw notFound('Região não encontrada.');
  return row;
}

export async function deleteRegion(id: string) {
  const db = getDb();
  const rows = await db
    .update(deliveryRegions)
    .set({ deletedAt: new Date(), isActive: false })
    .where(and(eq(deliveryRegions.id, id), isNull(deliveryRegions.deletedAt)))
    .returning({ id: deliveryRegions.id });
  if (!rows[0]) throw notFound('Região não encontrada.');
}

export async function listRegionsForAdmin() {
  const db = getDb();
  return db
    .select()
    .from(deliveryRegions)
    .where(isNull(deliveryRegions.deletedAt))
    .orderBy(asc(deliveryRegions.sortOrder), asc(deliveryRegions.name));
}

/* ─────────────────────── Configurações da loja ─────────────────────── */

export async function updateStoreSettings(input: StoreSettingsInput) {
  const db = getDb();
  const { hours, ...settings } = input;

  if (
    settings.etaMinMinutes !== undefined &&
    settings.etaMaxMinutes !== undefined &&
    settings.etaMinMinutes > settings.etaMaxMinutes
  ) {
    throw badRequest('O tempo mínimo de entrega não pode ser maior que o máximo.');
  }

  return db.transaction(async (tx) => {
    const rows = await tx
      .update(storeSettings)
      .set({ ...settings, updatedAt: new Date() })
      .where(eq(storeSettings.id, 'singleton'))
      .returning();

    if (hours?.length) {
      for (const hour of hours) {
        await tx
          .insert(storeHours)
          .values({
            weekday: hour.weekday,
            opensAt: hour.opensAt,
            closesAt: hour.closesAt,
            isClosed: hour.isClosed,
          })
          .onConflictDoUpdate({
            target: storeHours.weekday,
            set: { opensAt: hour.opensAt, closesAt: hour.closesAt, isClosed: hour.isClosed },
          });
      }
    }
    return rows[0]!;
  });
}

/* ────────────────────── Usuários administrativos ────────────────────── */

export async function listAdminUsers() {
  const db = getDb();
  return db
    .select({
      id: adminUsers.id,
      name: adminUsers.name,
      email: adminUsers.email,
      role: adminUsers.role,
      isActive: adminUsers.isActive,
      lastLoginAt: adminUsers.lastLoginAt,
      createdAt: adminUsers.createdAt,
    })
    .from(adminUsers)
    .where(isNull(adminUsers.deletedAt))
    .orderBy(asc(adminUsers.name));
}

export async function createAdminUser(input: {
  name: string;
  email: string;
  password?: string;
  role: 'admin' | 'operator';
  isActive?: boolean;
}) {
  if (!input.password) throw badRequest('Informe uma senha para o novo usuário.');
  const db = getDb();
  const existing = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(sql`lower(${adminUsers.email}) = ${input.email}`)
    .limit(1);
  if (existing[0]) throw conflict('Já existe um usuário administrativo com este e-mail.');

  const rows = await db
    .insert(adminUsers)
    .values({
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      isActive: input.isActive ?? true,
    })
    .returning({ id: adminUsers.id, name: adminUsers.name, email: adminUsers.email, role: adminUsers.role });
  return rows[0]!;
}

export async function updateAdminUser(
  id: string,
  input: { name: string; email: string; password?: string; role: 'admin' | 'operator'; isActive?: boolean },
  actingAdminId: string,
) {
  const db = getDb();
  // Um administrador não pode rebaixar ou desativar a si mesmo e travar o painel.
  if (id === actingAdminId && (input.role !== 'admin' || input.isActive === false)) {
    throw badRequest('Você não pode remover o próprio acesso de administrador.');
  }
  const rows = await db
    .update(adminUsers)
    .set({
      name: input.name,
      email: input.email,
      role: input.role,
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(adminUsers.id, id), isNull(adminUsers.deletedAt)))
    .returning({ id: adminUsers.id, name: adminUsers.name, email: adminUsers.email, role: adminUsers.role });
  const row = rows[0];
  if (!row) throw notFound('Usuário administrativo não encontrado.');
  return row;
}

export async function deleteAdminUser(id: string, actingAdminId: string) {
  if (id === actingAdminId) throw badRequest('Você não pode excluir o próprio usuário.');
  const db = getDb();
  const remaining = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(adminUsers)
    .where(and(eq(adminUsers.role, 'admin'), eq(adminUsers.isActive, true), isNull(adminUsers.deletedAt)));
  const target = await db.select({ role: adminUsers.role }).from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
  if (target[0]?.role === 'admin' && (remaining[0]?.total ?? 0) <= 1) {
    throw conflict('É necessário manter ao menos um administrador ativo.');
  }
  await db.update(adminUsers).set({ deletedAt: new Date(), isActive: false }).where(eq(adminUsers.id, id));
}

/* ───────────────────────────── Dashboard ───────────────────────────── */

export interface DashboardMetrics {
  period: { from: string; to: string };
  totals: {
    ordersAllTime: number;
    ordersToday: number;
    preparing: number;
    completed: number;
    awaitingAction: number;
  };
  revenue: {
    /** Faturamento do período: exclui cancelados e desconta nada além de descontos aplicados. */
    grossCents: number;
    netCents: number;
    cancelledCents: number;
    orders: number;
    averageTicketCents: number;
  };
  topProducts: { name: string; quantity: number; revenueCents: number }[];
  byStatus: { status: string; total: number }[];
}

/**
 * Indicadores calculados a partir dos pedidos persistidos.
 * Regra de faturamento: pedidos cancelados NÃO entram; descontos são
 * subtraídos; a taxa de entrega entra no bruto e sai do líquido.
 */
export async function getDashboardMetrics(range: { from?: string; to?: string }): Promise<DashboardMetrics> {
  const db = getDb();
  const to = range.to ? new Date(range.to) : new Date();
  const from = range.from ? new Date(range.from) : new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const inPeriod = and(gte(orders.createdAt, from), lte(orders.createdAt, to));

  const [allTime] = await db.select({ total: sql<number>`count(*)::int` }).from(orders);
  const [today] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(orders)
    .where(gte(orders.createdAt, startOfToday));
  const [preparing] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.status, 'preparing'));
  const [completed] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.status, 'delivered'));
  const [awaiting] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(orders)
    .where(sql`${orders.status} IN ('received', 'confirmed')`);

  const [revenue] = await db
    .select({
      grossCents: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} <> 'cancelled' THEN ${orders.totalCents} ELSE 0 END), 0)::int`,
      netCents: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} <> 'cancelled' THEN ${orders.subtotalCents} - ${orders.discountCents} ELSE 0 END), 0)::int`,
      cancelledCents: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} = 'cancelled' THEN ${orders.totalCents} ELSE 0 END), 0)::int`,
      orders: sql<number>`COUNT(*) FILTER (WHERE ${orders.status} <> 'cancelled')::int`,
    })
    .from(orders)
    .where(inPeriod);

  const topProducts = await db
    .select({
      name: orderItems.nameSnapshot,
      quantity: sql<number>`SUM(${orderItems.quantity})::int`,
      revenueCents: sql<number>`SUM(${orderItems.totalCents})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(inPeriod, ne(orders.status, 'cancelled')))
    .groupBy(orderItems.nameSnapshot)
    .orderBy(desc(sql`SUM(${orderItems.quantity})`))
    .limit(8);

  const byStatus = await db
    .select({ status: orders.status, total: sql<number>`count(*)::int` })
    .from(orders)
    .where(inPeriod)
    .groupBy(orders.status);

  const revenueOrders = revenue?.orders ?? 0;
  const grossCents = revenue?.grossCents ?? 0;

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      ordersAllTime: allTime?.total ?? 0,
      ordersToday: today?.total ?? 0,
      preparing: preparing?.total ?? 0,
      completed: completed?.total ?? 0,
      awaitingAction: awaiting?.total ?? 0,
    },
    revenue: {
      grossCents,
      netCents: revenue?.netCents ?? 0,
      cancelledCents: revenue?.cancelledCents ?? 0,
      orders: revenueOrders,
      averageTicketCents: revenueOrders > 0 ? Math.round(grossCents / revenueOrders) : 0,
    },
    topProducts,
    byStatus,
  };
}
