import { pgEnum } from 'drizzle-orm/pg-core';
import { ORDER_STATUSES, FULFILLMENT_TYPES, PAYMENT_METHODS, PAYMENT_STATUSES } from '../../shared/orders';
import { ADMIN_ROLES } from '../../shared/constants';

export const orderStatusEnum = pgEnum('order_status', ORDER_STATUSES);
export const fulfillmentEnum = pgEnum('fulfillment_type', FULFILLMENT_TYPES);
export const paymentMethodEnum = pgEnum('payment_method', PAYMENT_METHODS);
export const paymentStatusEnum = pgEnum('payment_status', PAYMENT_STATUSES);
export const adminRoleEnum = pgEnum('admin_role', ADMIN_ROLES);
export const productKindEnum = pgEnum('product_kind', ['simple', 'combo']);
export const sessionSubjectEnum = pgEnum('session_subject', ['customer', 'admin']);
