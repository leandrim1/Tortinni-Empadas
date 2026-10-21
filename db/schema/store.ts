import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  smallint,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** Linha única (id = 'singleton') com a configuração da loja. */
export const storeSettings = pgTable('store_settings', {
  id: text('id').primaryKey().default('singleton'),
  name: text('name').notNull(),
  tagline: text('tagline'),
  logoUrl: text('logo_url'),
  bannerUrl: text('banner_url'),
  instagramUrl: text('instagram_url'),
  whatsappNumber: text('whatsapp_number'),
  email: text('email'),
  addressLine: text('address_line'),
  /** Fuso usado para decidir se a loja está aberta. */
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  minOrderCents: integer('min_order_cents').notNull().default(2000),
  etaMinMinutes: integer('eta_min_minutes').notNull().default(30),
  etaMaxMinutes: integer('eta_max_minutes').notNull().default(50),
  /** Nota e número de avaliações: só exibidos quando preenchidos pelo administrador. */
  ratingValue: text('rating_value'),
  ratingCount: integer('rating_count'),
  /** Fechamento manual, independente do horário configurado. */
  manuallyClosed: boolean('manually_closed').notNull().default(false),
  closedMessage: text('closed_message'),
  announcement: text('announcement'),
  pickupEnabled: boolean('pickup_enabled').notNull().default(true),
  deliveryEnabled: boolean('delivery_enabled').notNull().default(true),
  guestCheckoutEnabled: boolean('guest_checkout_enabled').notNull().default(true),
  acceptsPix: boolean('accepts_pix').notNull().default(true),
  acceptsCash: boolean('accepts_cash').notNull().default(true),
  acceptsCardOnDelivery: boolean('accepts_card_on_delivery').notNull().default(true),
  acceptsCardOnline: boolean('accepts_card_online').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Horário de funcionamento por dia da semana (0 = domingo). */
export const storeHours = pgTable(
  'store_hours',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weekday: smallint('weekday').notNull(),
    opensAt: text('opens_at').notNull().default('09:00'),
    closesAt: text('closes_at').notNull().default('18:00'),
    isClosed: boolean('is_closed').notNull().default(false),
  },
  (t) => ({
    weekdayUnique: uniqueIndex('store_hours_weekday_unique').on(t.weekday),
    weekdayRange: check('store_hours_weekday_range', sql`${t.weekday} BETWEEN 0 AND 6`),
  }),
);

export const deliveryRegions = pgTable(
  'delivery_regions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** Bairro normalizado em minúsculas para casamento com o endereço digitado. */
    neighborhoodKey: text('neighborhood_key').notNull(),
    city: text('city').notNull().default('—'),
    feeCents: integer('fee_cents').notNull().default(0),
    minOrderCents: integer('min_order_cents'),
    etaMinMinutes: integer('eta_min_minutes'),
    etaMaxMinutes: integer('eta_max_minutes'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    keyUnique: uniqueIndex('delivery_regions_key_unique').on(t.neighborhoodKey),
    byActive: index('delivery_regions_active_idx').on(t.isActive),
    feeNonNegative: check('delivery_regions_fee_non_negative', sql`${t.feeCents} >= 0`),
  }),
);
