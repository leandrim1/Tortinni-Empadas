import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { productKindEnum } from './enums';

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    imageUrl: text('image_url'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    slugUnique: uniqueIndex('categories_slug_unique').on(t.slug),
    bySort: index('categories_sort_idx').on(t.sortOrder),
  }),
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /**
     * Texto normalizado (minúsculo, sem acentos) com nome + descrição + categoria.
     * Mantido pelo serviço de catálogo e usado pela busca com ILIKE.
     */
    searchText: text('search_text').notNull().default(''),
    /** Preço cheio em centavos. */
    priceCents: integer('price_cents').notNull(),
    /** Preço promocional em centavos, válido na janela promo_starts_at..promo_ends_at. */
    promoPriceCents: integer('promo_price_cents'),
    promoStartsAt: timestamp('promo_starts_at', { withTimezone: true }),
    promoEndsAt: timestamp('promo_ends_at', { withTimezone: true }),
    kind: productKindEnum('kind').notNull().default('simple'),
    imageUrl: text('image_url'),
    imageAlt: text('image_alt'),
    /** Conteúdo provisório gerado no seed, aguardando revisão do administrador. */
    needsReview: boolean('needs_review').notNull().default(false),
    isAvailable: boolean('is_available').notNull().default(true),
    isFeatured: boolean('is_featured').notNull().default(false),
    serves: integer('serves'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    slugUnique: uniqueIndex('products_slug_unique').on(t.slug),
    byCategory: index('products_category_idx').on(t.categoryId),
    byFeatured: index('products_featured_idx').on(t.isFeatured),
    byAvailability: index('products_availability_idx').on(t.isAvailable, t.deletedAt),
    pricePositive: check('products_price_positive', sql`${t.priceCents} > 0`),
    promoValid: check(
      'products_promo_valid',
      sql`${t.promoPriceCents} IS NULL OR (${t.promoPriceCents} > 0 AND ${t.promoPriceCents} < ${t.priceCents})`,
    ),
  }),
);

export const productImages = pgTable(
  'product_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    /** Caminho no Vercel Blob, necessário para apagar o arquivo junto com o registro. */
    blobPathname: text('blob_pathname'),
    alt: text('alt'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byProduct: index('product_images_product_idx').on(t.productId, t.sortOrder),
  }),
);

/** Variações simples (ex.: tamanho), com acréscimo sobre o preço base. */
export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    priceDeltaCents: integer('price_delta_cents').notNull().default(0),
    isAvailable: boolean('is_available').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byProduct: index('product_variants_product_idx').on(t.productId, t.sortOrder),
  }),
);

/** Um combo é um produto (kind = 'combo') com grupos de escolha. */
export const combos = pgTable(
  'combos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    instructions: text('instructions'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    productUnique: uniqueIndex('combos_product_unique').on(t.productId),
  }),
);

/** Ex.: "Escolha 2 empadas" (min=2, max=2) e "Escolha 1 refrigerante". */
export const comboGroups = pgTable(
  'combo_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    comboId: uuid('combo_id')
      .notNull()
      .references(() => combos.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    helpText: text('help_text'),
    minSelect: integer('min_select').notNull().default(1),
    maxSelect: integer('max_select').notNull().default(1),
    /** Permite escolher o mesmo sabor mais de uma vez dentro do grupo. */
    allowRepeat: boolean('allow_repeat').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({
    byCombo: index('combo_groups_combo_idx').on(t.comboId, t.sortOrder),
    selectRange: check(
      'combo_groups_select_range',
      sql`${t.minSelect} >= 0 AND ${t.maxSelect} >= ${t.minSelect} AND ${t.maxSelect} > 0`,
    ),
  }),
);

export const comboOptions = pgTable(
  'combo_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => comboGroups.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** Acréscimo opcional sobre o preço do combo. */
    extraPriceCents: integer('extra_price_cents').notNull().default(0),
    isAvailable: boolean('is_available').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({
    byGroup: index('combo_options_group_idx').on(t.groupId, t.sortOrder),
    groupProductUnique: uniqueIndex('combo_options_group_product_unique').on(t.groupId, t.productId),
  }),
);
