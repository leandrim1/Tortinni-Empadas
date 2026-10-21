import { and, asc, desc, eq, gte, ilike, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { getDb, type Database } from '../lib/db';
import {
  orders,
  orderItems,
  orderItemOptions,
  orderStatusHistory,
  paymentTransactions,
} from '../../db/schema';
import { loadProductsByIds } from './catalog';
import { getStoreSettings, getStoreStatus, quoteDelivery, availablePaymentMethods } from './store';
import { priceCart, type PricedCart } from '../../shared/pricing';
import { canTransition, type OrderStatus, type FulfillmentType } from '../../shared/orders';
import { generateOrderCode, generateToken, hashToken, safeEqual } from '../lib/crypto';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../lib/errors';
import type { CreateOrderInput, CartItemInput } from '../validators/orders';
import { logger } from '../lib/logger';

export interface QuoteResult extends PricedCart {
  fulfillment: FulfillmentType;
  regionId: string | null;
  regionName: string | null;
  serviceableAddress: boolean;
  deliveryMessage?: string;
  etaMinMinutes: number;
  etaMaxMinutes: number;
  storeOpen: boolean;
  storeMessage: string;
}

/**
 * Recalcula o carrinho inteiro a partir do banco.
 * Usado pelo endpoint de cotação e pela criação do pedido — mesma função,
 * para que o valor exibido no checkout seja exatamente o cobrado.
 */
export async function quoteCart(input: {
  items: CartItemInput[];
  fulfillment: FulfillmentType;
  regionId?: string | null;
  neighborhood?: string | null;
}): Promise<QuoteResult> {
  const ids = [...new Set(input.items.map((item) => item.productId))];
  const [productList, delivery, status] = await Promise.all([
    loadProductsByIds(ids, true),
    quoteDelivery({
      fulfillment: input.fulfillment,
      regionId: input.regionId ?? null,
      neighborhood: input.neighborhood ?? null,
    }),
    getStoreStatus(),
  ]);

  const productMap = new Map(productList.map((product) => [product.id, product]));
  const priced = priceCart(input.items, {
    products: productMap,
    minOrderCents: delivery.minOrderCents,
    deliveryFeeCents: input.fulfillment === 'delivery' && delivery.serviceable ? delivery.feeCents : 0,
  });

  return {
    ...priced,
    fulfillment: input.fulfillment,
    regionId: delivery.region?.id ?? null,
    regionName: delivery.region?.name ?? null,
    serviceableAddress: delivery.serviceable,
    deliveryMessage: delivery.message,
    etaMinMinutes: delivery.etaMinMinutes,
    etaMaxMinutes: delivery.etaMaxMinutes,
    storeOpen: status.isOpen,
    storeMessage: status.message,
  };
}

export interface CreatedOrder {
  id: string;
  code: string;
  /** Token puro de acompanhamento — exibido uma única vez ao cliente. */
  trackingToken: string;
  status: OrderStatus;
  totalCents: number;
}

/**
 * Cria o pedido dentro de uma transação, recalculando tudo no servidor.
 * Preço, taxa e total enviados pelo navegador são ignorados por completo.
 */
export async function createOrder(
  input: CreateOrderInput,
  context: { userId?: string | null; ip?: string },
): Promise<CreatedOrder> {
  const settings = await getStoreSettings();
  const status = await getStoreStatus();

  if (!status.isOpen) {
    throw conflict(
      settings.closedMessage ?? 'A loja está fechada no momento. Tente novamente no horário de funcionamento.',
    );
  }

  if (input.fulfillment === 'pickup' && !settings.pickupEnabled) {
    throw badRequest('Retirada no local indisponível no momento.');
  }
  if (input.fulfillment === 'delivery' && !settings.deliveryEnabled) {
    throw badRequest('Entrega indisponível no momento.');
  }

  const allowedMethods = availablePaymentMethods(settings).filter((m) => m.enabled).map((m) => m.method);
  if (!allowedMethods.includes(input.paymentMethod)) {
    throw badRequest('Forma de pagamento indisponível. Escolha outra opção.');
  }

  const quote = await quoteCart({
    items: input.items,
    fulfillment: input.fulfillment,
    regionId: input.address?.regionId ?? null,
    neighborhood: input.address?.neighborhood ?? null,
  });

  if (quote.issues.length > 0) {
    throw unprocessable(quote.issues[0]!.message, quote.issues);
  }
  if (quote.items.length === 0) {
    throw badRequest('Seu carrinho está vazio.');
  }
  if (input.fulfillment === 'delivery' && !quote.serviceableAddress) {
    throw badRequest(quote.deliveryMessage ?? 'Não entregamos neste endereço.');
  }
  if (!quote.meetsMinimum) {
    throw unprocessable(
      `O pedido mínimo é de ${formatCents(quote.minOrderCents)}. Faltam ${formatCents(quote.missingForMinimumCents)}.`,
      { code: 'min_order_not_met', missingForMinimumCents: quote.missingForMinimumCents },
    );
  }
  if (
    input.paymentMethod === 'cash' &&
    input.changeForCents != null &&
    input.changeForCents > 0 &&
    input.changeForCents < quote.totalCents
  ) {
    throw badRequest('O valor para troco precisa ser maior ou igual ao total do pedido.');
  }

  const db = getDb();
  const trackingToken = generateToken(32);
  const trackingTokenHash = hashToken(trackingToken);

  const result = await db.transaction(async (tx) => {
    const code = await reserveOrderCode(tx);

    const [order] = await tx
      .insert(orders)
      .values({
        code,
        userId: context.userId ?? null,
        trackingTokenHash,
        status: 'received',
        fulfillment: input.fulfillment,
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentMethod === 'pix' ? 'awaiting_payment' : 'pending',
        customerName: input.customer.name,
        customerPhone: input.customer.phone,
        customerEmail: input.customer.email ?? null,
        addressStreet: input.address?.street ?? null,
        addressNumber: input.address?.number ?? null,
        addressComplement: input.address?.complement ?? null,
        addressNeighborhood: input.address?.neighborhood ?? null,
        addressCity: input.address?.city ?? null,
        addressReference: input.address?.reference ?? null,
        deliveryRegionId: quote.regionId,
        subtotalCents: quote.subtotalCents,
        deliveryFeeCents: quote.deliveryFeeCents,
        discountCents: quote.discountCents,
        totalCents: quote.totalCents,
        changeForCents: input.paymentMethod === 'cash' ? input.changeForCents ?? null : null,
        notes: input.notes ?? null,
        estimatedMinMinutes: quote.etaMinMinutes,
        estimatedMaxMinutes: quote.etaMaxMinutes,
      })
      .returning({ id: orders.id, code: orders.code, totalCents: orders.totalCents });

    if (!order) throw new Error('Falha ao criar o pedido.');

    for (const item of quote.items) {
      const [savedItem] = await tx
        .insert(orderItems)
        .values({
          orderId: order.id,
          productId: item.productId,
          nameSnapshot: item.name,
          unitPriceCents: item.unitPriceCents,
          quantity: item.quantity,
          totalCents: item.totalCents,
          notes: item.notes ?? null,
        })
        .returning({ id: orderItems.id });

      if (!savedItem) throw new Error('Falha ao salvar item do pedido.');

      if (item.options.length > 0) {
        await tx.insert(orderItemOptions).values(
          item.options.map((option) => ({
            orderItemId: savedItem.id,
            groupLabel: option.groupTitle,
            optionLabel: option.label,
            optionProductId: option.optionProductId,
            variantId: null,
            quantity: option.quantity,
            priceDeltaCents: option.priceDeltaCents,
          })),
        );
      }
    }

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: 'received',
      note: 'Pedido recebido pela loja.',
    });

    return order;
  });

  logger.info('Pedido criado', { orderId: result.id, code: result.code, total: result.totalCents });

  return {
    id: result.id,
    code: result.code,
    trackingToken,
    status: 'received',
    totalCents: result.totalCents,
  };
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Gera um código único, com algumas tentativas em caso de colisão. */
async function reserveOrderCode(tx: Transaction): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateOrderCode();
    const existing = await tx.select({ id: orders.id }).from(orders).where(eq(orders.code, code)).limit(1);
    if (existing.length === 0) return code;
  }
  throw new Error('Não foi possível gerar um código de pedido único.');
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export interface OrderDetail {
  id: string;
  code: string;
  status: OrderStatus;
  fulfillment: FulfillmentType;
  paymentMethod: string;
  paymentStatus: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  address: {
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    reference: string | null;
  } | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  changeForCents: number | null;
  notes: string | null;
  estimatedMinMinutes: number | null;
  estimatedMaxMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
  cancelReason: string | null;
  items: {
    id: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    notes: string | null;
    options: { groupLabel: string; optionLabel: string; quantity: number; priceDeltaCents: number }[];
  }[];
  history: { status: OrderStatus; note: string | null; createdAt: Date }[];
  payment?: {
    provider: string;
    status: string;
    pixCopyPaste: string | null;
    pixQrCode: string | null;
    expiresAt: Date | null;
  } | null;
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail> {
  const db = getDb();
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const order = rows[0];
  if (!order) throw notFound('Pedido não encontrado.');

  const [items, history, payments] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.id)),
    db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(asc(orderStatusHistory.createdAt)),
    db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.orderId, orderId))
      .orderBy(desc(paymentTransactions.createdAt))
      .limit(1),
  ]);

  const itemIds = items.map((item) => item.id);
  const options = itemIds.length
    ? await db.select().from(orderItemOptions).where(inArray(orderItemOptions.orderItemId, itemIds))
    : [];

  const payment = payments[0];

  return {
    id: order.id,
    code: order.code,
    status: order.status,
    fulfillment: order.fulfillment,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    address: order.addressStreet
      ? {
          street: order.addressStreet,
          number: order.addressNumber,
          complement: order.addressComplement,
          neighborhood: order.addressNeighborhood,
          city: order.addressCity,
          reference: order.addressReference,
        }
      : null,
    subtotalCents: order.subtotalCents,
    deliveryFeeCents: order.deliveryFeeCents,
    discountCents: order.discountCents,
    totalCents: order.totalCents,
    changeForCents: order.changeForCents,
    notes: order.notes,
    estimatedMinMinutes: order.estimatedMinMinutes,
    estimatedMaxMinutes: order.estimatedMaxMinutes,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    cancelReason: order.cancelReason,
    items: items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      totalCents: item.totalCents,
      notes: item.notes,
      options: options
        .filter((option) => option.orderItemId === item.id)
        .map((option) => ({
          groupLabel: option.groupLabel,
          optionLabel: option.optionLabel,
          quantity: option.quantity,
          priceDeltaCents: option.priceDeltaCents,
        })),
    })),
    history: history.map((entry) => ({
      status: entry.toStatus,
      note: entry.note,
      createdAt: entry.createdAt,
    })),
    payment: payment
      ? {
          provider: payment.provider,
          status: payment.status,
          pixCopyPaste: payment.pixCopyPaste,
          pixQrCode: payment.pixQrCode,
          expiresAt: payment.expiresAt,
        }
      : null,
  };
}

/**
 * Acompanhamento sem login: exige código + token aleatório.
 * A comparação usa o hash, então o token nunca é guardado em claro.
 */
export async function getOrderByTracking(code: string, token: string): Promise<OrderDetail> {
  const db = getDb();
  const rows = await db
    .select({ id: orders.id, trackingTokenHash: orders.trackingTokenHash })
    .from(orders)
    .where(eq(orders.code, code.trim().toUpperCase()))
    .limit(1);
  const order = rows[0];
  // Mesma resposta para código inexistente e token errado: não revela pedidos alheios.
  if (!order || !safeEqual(order.trackingTokenHash, hashToken(token))) {
    throw notFound('Pedido não encontrado ou link de acompanhamento inválido.');
  }
  return getOrderDetail(order.id);
}

export async function getOrderForCustomer(orderId: string, userId: string): Promise<OrderDetail> {
  const db = getDb();
  const rows = await db
    .select({ userId: orders.userId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  const order = rows[0];
  if (!order) throw notFound('Pedido não encontrado.');
  if (order.userId !== userId) throw forbidden('Este pedido não pertence à sua conta.');
  return getOrderDetail(orderId);
}

export async function listCustomerOrders(userId: string, page = 1, pageSize = 10) {
  const db = getDb();
  const offset = (page - 1) * pageSize;
  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.userId, userId));

  const rows = await db
    .select({
      id: orders.id,
      code: orders.code,
      status: orders.status,
      fulfillment: orders.fulfillment,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))
    .limit(pageSize)
    .offset(offset);

  const total = countRow?.total ?? 0;
  return { items: rows, total, page, pageSize, hasMore: page * pageSize < total };
}

export interface AdminOrderFilters {
  status?: OrderStatus;
  code?: string;
  customer?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export async function listOrdersForAdmin(filters: AdminOrderFilters) {
  const db = getDb();
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(orders.status, filters.status));
  if (filters.code) conditions.push(ilike(orders.code, `%${filters.code.trim()}%`));
  if (filters.customer) {
    const term = `%${filters.customer.trim()}%`;
    const condition = sql`(${orders.customerName} ILIKE ${term} OR ${orders.customerPhone} ILIKE ${term})`;
    conditions.push(condition);
  }
  if (filters.from) conditions.push(gte(orders.createdAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(orders.createdAt, new Date(filters.to)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRow] = await db.select({ total: sql<number>`count(*)::int` }).from(orders).where(where);

  const rows = await db
    .select({
      id: orders.id,
      code: orders.code,
      status: orders.status,
      fulfillment: orders.fulfillment,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      neighborhood: orders.addressNeighborhood,
      subtotalCents: orders.subtotalCents,
      deliveryFeeCents: orders.deliveryFeeCents,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  const total = countRow?.total ?? 0;
  return {
    items: rows,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    hasMore: filters.page * filters.pageSize < total,
  };
}

/**
 * Atualiza o status validando a transição. O cliente nunca chega aqui:
 * a rota exige sessão administrativa.
 */
export async function updateOrderStatus(
  orderId: string,
  nextStatus: OrderStatus,
  options: { adminId: string; note?: string; cancelReason?: string },
): Promise<OrderDetail> {
  const db = getDb();

  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ status: orders.status, fulfillment: orders.fulfillment })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    const order = rows[0];
    if (!order) throw notFound('Pedido não encontrado.');

    if (order.status === nextStatus) {
      throw conflict(`O pedido já está no status "${nextStatus}".`);
    }
    if (!canTransition(order.status, nextStatus, order.fulfillment)) {
      throw conflict(
        `Transição inválida: não é possível ir de "${order.status}" para "${nextStatus}" em um pedido de ${
          order.fulfillment === 'delivery' ? 'entrega' : 'retirada'
        }.`,
      );
    }

    const now = new Date();
    await tx
      .update(orders)
      .set({
        status: nextStatus,
        updatedAt: now,
        confirmedAt: nextStatus === 'confirmed' ? now : undefined,
        deliveredAt: nextStatus === 'delivered' ? now : undefined,
        cancelledAt: nextStatus === 'cancelled' ? now : undefined,
        cancelReason: nextStatus === 'cancelled' ? options.cancelReason ?? null : undefined,
      })
      .where(eq(orders.id, orderId));

    await tx.insert(orderStatusHistory).values({
      orderId,
      fromStatus: order.status,
      toStatus: nextStatus,
      changedByAdminId: options.adminId,
      note: options.note ?? null,
    });
  });

  return getOrderDetail(orderId);
}
