export const ORDER_STATUSES = [
  'received',
  'confirmed',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  received: 'Recebido',
  confirmed: 'Confirmado',
  preparing: 'Em preparação',
  ready_for_pickup: 'Pronto para retirada',
  out_for_delivery: 'Saiu para entrega',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

export const FULFILLMENT_TYPES = ['delivery', 'pickup'] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];

export const PAYMENT_METHODS = ['pix', 'cash', 'card_on_delivery', 'card_online'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'Pix',
  cash: 'Dinheiro na entrega',
  card_on_delivery: 'Cartão na entrega',
  card_online: 'Cartão online',
};

export const PAYMENT_STATUSES = ['pending', 'awaiting_payment', 'paid', 'refunded', 'failed', 'cancelled'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pagamento na entrega',
  awaiting_payment: 'Aguardando pagamento',
  paid: 'Pago',
  refunded: 'Reembolsado',
  failed: 'Falhou',
  cancelled: 'Cancelado',
};

/**
 * Máquina de estados. As transições dependem do tipo de pedido:
 * entrega passa por "saiu para entrega", retirada por "pronto para retirada".
 */
export function allowedTransitions(
  current: OrderStatus,
  fulfillment: FulfillmentType,
): OrderStatus[] {
  switch (current) {
    case 'received':
      return ['confirmed', 'cancelled'];
    case 'confirmed':
      return ['preparing', 'cancelled'];
    case 'preparing':
      return fulfillment === 'delivery'
        ? ['out_for_delivery', 'cancelled']
        : ['ready_for_pickup', 'cancelled'];
    case 'ready_for_pickup':
      return ['delivered', 'cancelled'];
    case 'out_for_delivery':
      return ['delivered', 'cancelled'];
    case 'delivered':
    case 'cancelled':
      return [];
    default:
      return [];
  }
}

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  fulfillment: FulfillmentType,
): boolean {
  return allowedTransitions(from, fulfillment).includes(to);
}

/** Etapas exibidas na linha do tempo de acompanhamento. */
export function timelineFor(fulfillment: FulfillmentType): OrderStatus[] {
  return fulfillment === 'delivery'
    ? ['received', 'confirmed', 'preparing', 'out_for_delivery', 'delivered']
    : ['received', 'confirmed', 'preparing', 'ready_for_pickup', 'delivered'];
}

export const TERMINAL_STATUSES: OrderStatus[] = ['delivered', 'cancelled'];
