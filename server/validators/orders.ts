import { z } from 'zod';
import { uuidSchema, nameSchema, phoneSchema, emailSchema } from './common';
import { FULFILLMENT_TYPES, PAYMENT_METHODS, ORDER_STATUSES } from '../../shared/orders';
import { MAX_ITEM_QUANTITY } from '../../shared/constants';

/**
 * O navegador envia apenas O QUE foi escolhido — nunca quanto custa.
 * Todos os preços são lidos do banco no momento da criação do pedido.
 */
export const cartSelectionSchema = z.object({
  groupId: uuidSchema,
  optionProductIds: z.array(uuidSchema).min(1).max(10),
});

export const cartItemSchema = z.object({
  productId: uuidSchema,
  quantity: z.number().int().min(1, 'Quantidade mínima é 1.').max(MAX_ITEM_QUANTITY),
  variantId: uuidSchema.optional().nullable(),
  selections: z.array(cartSelectionSchema).max(10).optional().default([]),
  notes: z.string().trim().max(200).optional(),
});

export const cartSchema = z.object({
  items: z.array(cartItemSchema).min(1, 'Seu carrinho está vazio.').max(50),
});

export const quoteSchema = cartSchema.extend({
  fulfillment: z.enum(FULFILLMENT_TYPES).default('delivery'),
  neighborhood: z.string().trim().max(120).optional(),
  regionId: uuidSchema.optional().nullable(),
});

export const createOrderSchema = cartSchema.extend({
  fulfillment: z.enum(FULFILLMENT_TYPES),
  paymentMethod: z.enum(PAYMENT_METHODS),
  customer: z.object({
    name: nameSchema,
    phone: phoneSchema,
    email: emailSchema.optional(),
  }),
  address: z
    .object({
      street: z.string().trim().min(3, 'Informe a rua.').max(160),
      number: z.string().trim().min(1, 'Informe o número.').max(20),
      complement: z.string().trim().max(120).optional(),
      neighborhood: z.string().trim().min(2, 'Informe o bairro.').max(120),
      city: z.string().trim().min(2, 'Informe a cidade.').max(120),
      reference: z.string().trim().max(200).optional(),
      regionId: uuidSchema.optional().nullable(),
    })
    .optional(),
  notes: z.string().trim().max(500).optional(),
  /** Troco para quanto, em centavos, quando o pagamento for em dinheiro. */
  changeForCents: z.number().int().min(0).max(100_000_00).optional().nullable(),
})
  .superRefine((value, ctx) => {
    if (value.fulfillment === 'delivery' && !value.address) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['address'],
        message: 'Informe o endereço de entrega.',
      });
    }
  });

export const trackOrderSchema = z.object({
  code: z.string().trim().min(4).max(20),
  token: z.string().trim().min(16).max(256),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(300).optional(),
  cancelReason: z.string().trim().max(300).optional(),
});

export const adminOrderFiltersSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  code: z.string().trim().max(20).optional(),
  customer: z.string().trim().max(120).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CartInput = z.infer<typeof cartSchema>;
export type CartItemInput = z.infer<typeof cartItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
