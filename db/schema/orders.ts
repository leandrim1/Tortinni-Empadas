import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  orderStatusEnum,
  fulfillmentEnum,
  paymentMethodEnum,
  paymentStatusEnum,
} from './enums';
import { users, adminUsers } from './auth';
import { products, productVariants } from './catalog';
import { deliveryRegions } from './store';

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Código curto exibido ao cliente, ex.: TRT-5F3A21. */
    code: text('code').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Hash do token de acompanhamento sem login. O token puro só vai para o cliente. */
    trackingTokenHash: text('tracking_token_hash').notNull(),
    status: orderStatusEnum('status').notNull().default('received'),
    fulfillment: fulfillmentEnum('fulfillment').notNull(),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    paymentStatus: paymentStatusEnum('payment_status').notNull().default('pending'),

    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    customerEmail: text('customer_email'),

    addressStreet: text('address_street'),
    addressNumber: text('address_number'),
    addressComplement: text('address_complement'),
    addressNeighborhood: text('address_neighborhood'),
    addressCity: text('address_city'),
    addressReference: text('address_reference'),
    deliveryRegionId: uuid('delivery_region_id').references(() => deliveryRegions.id, {
      onDelete: 'set null',
    }),

    subtotalCents: integer('subtotal_cents').notNull(),
    deliveryFeeCents: integer('delivery_fee_cents').notNull().default(0),
    discountCents: integer('discount_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    /** Troco solicitado para pagamento em dinheiro. */
    changeForCents: integer('change_for_cents'),

    notes: text('notes'),
    estimatedMinMinutes: integer('estimated_min_minutes'),
    estimatedMaxMinutes: integer('estimated_max_minutes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
  },
  (t) => ({
    codeUnique: uniqueIndex('orders_code_unique').on(t.code),
    trackingUnique: uniqueIndex('orders_tracking_token_unique').on(t.trackingTokenHash),
    byUser: index('orders_user_idx').on(t.userId),
    byStatus: index('orders_status_idx').on(t.status),
    byCreatedAt: index('orders_created_at_idx').on(t.createdAt),
    byPhone: index('orders_phone_idx').on(t.customerPhone),
    totalsNonNegative: check(
      'orders_totals_non_negative',
      sql`${t.subtotalCents} >= 0 AND ${t.deliveryFeeCents} >= 0 AND ${t.discountCents} >= 0 AND ${t.totalCents} >= 0`,
    ),
  }),
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /** Referência histórica: o produto pode ser arquivado depois. */
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    /** Snapshot: nome e preço no momento do pedido. */
    nameSnapshot: text('name_snapshot').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    quantity: integer('quantity').notNull(),
    totalCents: integer('total_cents').notNull(),
    notes: text('notes'),
  },
  (t) => ({
    byOrder: index('order_items_order_idx').on(t.orderId),
    quantityPositive: check('order_items_quantity_positive', sql`${t.quantity} > 0`),
  }),
);

export const orderItemOptions = pgTable(
  'order_item_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'cascade' }),
    groupLabel: text('group_label').notNull(),
    optionLabel: text('option_label').notNull(),
    optionProductId: uuid('option_product_id').references(() => products.id, {
      onDelete: 'set null',
    }),
    variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
    quantity: integer('quantity').notNull().default(1),
    priceDeltaCents: integer('price_delta_cents').notNull().default(0),
  },
  (t) => ({
    byItem: index('order_item_options_item_idx').on(t.orderItemId),
  }),
);

export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: orderStatusEnum('from_status'),
    toStatus: orderStatusEnum('to_status').notNull(),
    changedByAdminId: uuid('changed_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOrder: index('order_status_history_order_idx').on(t.orderId, t.createdAt),
  }),
);

/**
 * Transações de pagamento. Nunca armazenar dados de cartão —
 * apenas identificadores do provedor e o status confirmado por ele.
 */
export const paymentTransactions = pgTable(
  'payment_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerChargeId: text('provider_charge_id'),
    status: paymentStatusEnum('status').notNull().default('awaiting_payment'),
    amountCents: integer('amount_cents').notNull(),
    pixQrCode: text('pix_qr_code'),
    pixCopyPaste: text('pix_copy_paste'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Payload do provedor, já sem dados sensíveis. */
    rawPayload: jsonb('raw_payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOrder: index('payment_transactions_order_idx').on(t.orderId),
    chargeUnique: uniqueIndex('payment_transactions_charge_unique').on(t.provider, t.providerChargeId),
  }),
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminUserId: uuid('admin_user_id').references(() => adminUsers.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byEntity: index('audit_logs_entity_idx').on(t.entity, t.entityId),
    byCreatedAt: index('audit_logs_created_at_idx').on(t.createdAt),
  }),
);

/**
 * Deduplicação de webhooks. A entrega é "pelo menos uma vez":
 * o mesmo evento pode chegar várias vezes e precisa ser processado uma só.
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(),
    /** Valor do header X-Webhook-Id, igual em todas as tentativas. */
    externalId: text('external_id').notNull(),
    eventType: text('event_type').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerEventUnique: uniqueIndex('webhook_events_provider_external_unique').on(t.provider, t.externalId),
  }),
);
