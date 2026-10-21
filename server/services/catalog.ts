import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  categories,
  products,
  productVariants,
  combos,
  comboGroups,
  comboOptions,
} from '../../db/schema';
import { notFound } from '../lib/errors';
import type { PricingProduct, PricingGroup } from '../../shared/pricing';
import { effectivePriceCents } from '../../shared/pricing';

/** Normalização usada tanto para gravar `search_text` quanto para buscar. */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSearchText(parts: (string | null | undefined)[]): string {
  return normalizeSearch(parts.filter(Boolean).join(' '));
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 110);
}

export interface PublicCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
}

export async function listCategories(onlyActive = true): Promise<PublicCategory[]> {
  const db = getDb();
  const where = onlyActive
    ? and(eq(categories.isActive, true), isNull(categories.deletedAt))
    : isNull(categories.deletedAt);
  return db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      imageUrl: categories.imageUrl,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .where(where)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

export interface PublicProduct extends PricingProduct {
  slug: string;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  categoryId: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  isFeatured: boolean;
  needsReview: boolean;
  serves: number | null;
  /** Preço já considerando promoção vigente — conveniência para a vitrine. */
  currentPriceCents: number;
  hasPromo: boolean;
}

interface ListProductsOptions {
  categorySlug?: string;
  search?: string;
  featuredOnly?: boolean;
  includeUnavailable?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ProductPage {
  items: PublicProduct[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Lista paginada do cardápio, já com grupos de combo resolvidos. */
export async function listProducts(options: ListProductsOptions = {}): Promise<ProductPage> {
  const db = getDb();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 24));

  const filters: SQL[] = [isNull(products.deletedAt)];
  if (!options.includeUnavailable) {
    filters.push(eq(products.isAvailable, true));
  }
  if (options.featuredOnly) filters.push(eq(products.isFeatured, true));
  if (options.categorySlug) filters.push(eq(categories.slug, options.categorySlug));
  if (options.search) {
    const term = normalizeSearch(options.search);
    if (term.length > 0) {
      const pattern = `%${term.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      const condition = or(
        sql`${products.searchText} LIKE ${pattern}`,
        sql`lower(${categories.name}) LIKE ${pattern}`,
      );
      if (condition) filters.push(condition);
    }
  }

  const whereClause = and(...filters);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(whereClause);

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      description: products.description,
      priceCents: products.priceCents,
      promoPriceCents: products.promoPriceCents,
      promoStartsAt: products.promoStartsAt,
      promoEndsAt: products.promoEndsAt,
      kind: products.kind,
      imageUrl: products.imageUrl,
      imageAlt: products.imageAlt,
      isAvailable: products.isAvailable,
      isFeatured: products.isFeatured,
      needsReview: products.needsReview,
      serves: products.serves,
      sortOrder: products.sortOrder,
      categoryId: products.categoryId,
      categorySlug: categories.slug,
      categoryName: categories.name,
      categorySort: categories.sortOrder,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(whereClause)
    .orderBy(asc(categories.sortOrder), asc(products.sortOrder), asc(products.name))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const ids = rows.map((r) => r.id);
  const [variantsByProduct, groupsByProduct] = await Promise.all([
    loadVariants(ids),
    loadComboGroups(ids),
  ]);

  const now = new Date();
  const items = rows.map((row) => {
    const base: PublicProduct = {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      priceCents: row.priceCents,
      promoPriceCents: row.promoPriceCents,
      promoStartsAt: row.promoStartsAt,
      promoEndsAt: row.promoEndsAt,
      kind: row.kind,
      imageUrl: row.imageUrl,
      imageAlt: row.imageAlt,
      isAvailable: row.isAvailable,
      isFeatured: row.isFeatured,
      needsReview: row.needsReview,
      serves: row.serves,
      categoryId: row.categoryId,
      categorySlug: row.categorySlug,
      categoryName: row.categoryName,
      variants: variantsByProduct.get(row.id) ?? [],
      comboGroups: groupsByProduct.get(row.id) ?? [],
      currentPriceCents: 0,
      hasPromo: false,
    };
    base.currentPriceCents = effectivePriceCents(base, now);
    base.hasPromo = base.currentPriceCents < base.priceCents;
    return base;
  });

  const total = countRow?.total ?? 0;
  return { items, total, page, pageSize, hasMore: page * pageSize < total };
}

async function loadVariants(productIds: string[]) {
  const map = new Map<string, PublicProduct['variants']>();
  if (productIds.length === 0) return map;
  const db = getDb();
  const rows = await db
    .select()
    .from(productVariants)
    .where(inArray(productVariants.productId, productIds))
    .orderBy(asc(productVariants.sortOrder), asc(productVariants.name));
  for (const row of rows) {
    const list = map.get(row.productId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      priceDeltaCents: row.priceDeltaCents,
      isAvailable: row.isAvailable,
    });
    map.set(row.productId, list);
  }
  return map;
}

async function loadComboGroups(productIds: string[]) {
  const map = new Map<string, PricingGroup[]>();
  if (productIds.length === 0) return map;
  const db = getDb();

  const rows = await db
    .select({
      productId: combos.productId,
      groupId: comboGroups.id,
      title: comboGroups.title,
      helpText: comboGroups.helpText,
      minSelect: comboGroups.minSelect,
      maxSelect: comboGroups.maxSelect,
      allowRepeat: comboGroups.allowRepeat,
      groupSort: comboGroups.sortOrder,
      optionProductId: comboOptions.productId,
      extraPriceCents: comboOptions.extraPriceCents,
      optionAvailable: comboOptions.isAvailable,
      optionSort: comboOptions.sortOrder,
      optionName: products.name,
      optionImage: products.imageUrl,
      optionProductAvailable: products.isAvailable,
      optionDeletedAt: products.deletedAt,
    })
    .from(combos)
    .innerJoin(comboGroups, eq(comboGroups.comboId, combos.id))
    .leftJoin(comboOptions, eq(comboOptions.groupId, comboGroups.id))
    .leftJoin(products, eq(products.id, comboOptions.productId))
    .where(inArray(combos.productId, productIds))
    .orderBy(asc(comboGroups.sortOrder), asc(comboOptions.sortOrder));

  for (const row of rows) {
    const groups = map.get(row.productId) ?? [];
    let group = groups.find((g) => g.id === row.groupId);
    if (!group) {
      group = {
        id: row.groupId,
        title: row.title,
        minSelect: row.minSelect,
        maxSelect: row.maxSelect,
        allowRepeat: row.allowRepeat,
        options: [],
      };
      (group as PricingGroup & { helpText?: string | null }).helpText = row.helpText;
      groups.push(group);
      map.set(row.productId, groups);
    }
    if (row.optionProductId && row.optionName) {
      group.options.push({
        productId: row.optionProductId,
        name: row.optionName,
        extraPriceCents: row.extraPriceCents ?? 0,
        // Opção indisponível se o vínculo OU o produto estiverem desligados.
        isAvailable:
          (row.optionAvailable ?? false) &&
          (row.optionProductAvailable ?? false) &&
          row.optionDeletedAt == null,
      });
      (group.options[group.options.length - 1] as { imageUrl?: string | null }).imageUrl = row.optionImage;
    }
  }
  return map;
}

export async function getProductBySlug(slug: string): Promise<PublicProduct> {
  const db = getDb();
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.slug, slug), isNull(products.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound('Produto não encontrado.');
  const product = await getProductById(row.id, true);
  if (!product) throw notFound('Produto não encontrado.');
  return product;
}

export async function getProductById(id: string, includeUnavailable = false): Promise<PublicProduct | undefined> {
  const page = await loadProductsByIds([id], includeUnavailable);
  return page[0];
}

/**
 * Carrega produtos por id para a precificação no servidor.
 * É a fonte da verdade de preço — nunca confiar no que vem do navegador.
 */
export async function loadProductsByIds(
  ids: string[],
  includeUnavailable = false,
): Promise<PublicProduct[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  const filters: SQL[] = [isNull(products.deletedAt), inArray(products.id, ids)];
  if (!includeUnavailable) filters.push(eq(products.isAvailable, true));

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      description: products.description,
      priceCents: products.priceCents,
      promoPriceCents: products.promoPriceCents,
      promoStartsAt: products.promoStartsAt,
      promoEndsAt: products.promoEndsAt,
      kind: products.kind,
      imageUrl: products.imageUrl,
      imageAlt: products.imageAlt,
      isAvailable: products.isAvailable,
      isFeatured: products.isFeatured,
      needsReview: products.needsReview,
      serves: products.serves,
      categoryId: products.categoryId,
      categorySlug: categories.slug,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...filters));

  const foundIds = rows.map((r) => r.id);
  const [variantsByProduct, groupsByProduct] = await Promise.all([
    loadVariants(foundIds),
    loadComboGroups(foundIds),
  ]);

  const now = new Date();
  return rows.map((row) => {
    const product: PublicProduct = {
      ...row,
      variants: variantsByProduct.get(row.id) ?? [],
      comboGroups: groupsByProduct.get(row.id) ?? [],
      currentPriceCents: 0,
      hasPromo: false,
    };
    product.currentPriceCents = effectivePriceCents(product, now);
    product.hasPromo = product.currentPriceCents < product.priceCents;
    return product;
  });
}

/** Produtos em destaque da home. */
export async function listFeatured(limit = 8): Promise<PublicProduct[]> {
  const page = await listProducts({ featuredOnly: true, pageSize: limit });
  return page.items;
}

/** Cardápio completo agrupado por categoria, usado na página de cardápio. */
export async function getMenu(): Promise<{
  categories: (PublicCategory & { products: PublicProduct[] })[];
}> {
  const [cats, page] = await Promise.all([
    listCategories(true),
    listProducts({ pageSize: 100, includeUnavailable: true }),
  ]);
  const byCategory = new Map<string, PublicProduct[]>();
  for (const product of page.items) {
    if (!product.categoryId) continue;
    const list = byCategory.get(product.categoryId) ?? [];
    list.push(product);
    byCategory.set(product.categoryId, list);
  }
  return {
    categories: cats
      .map((category) => ({ ...category, products: byCategory.get(category.id) ?? [] }))
      .filter((category) => category.products.length > 0),
  };
}

export async function listComboDefinitions() {
  const db = getDb();
  return db
    .select({ id: combos.id, productId: combos.productId, instructions: combos.instructions })
    .from(combos)
    .innerJoin(products, eq(products.id, combos.productId))
    .where(isNull(products.deletedAt))
    .orderBy(desc(products.isFeatured));
}
