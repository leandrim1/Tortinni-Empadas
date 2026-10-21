import { z } from 'zod';
import { uuidSchema, slugSchema, priceCentsSchema, nameSchema, emailSchema, passwordSchema } from './common';
import { ADMIN_ROLES } from '../../shared/constants';
import { PAYMENT_METHODS } from '../../shared/orders';

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da categoria.').max(80),
  slug: slugSchema.optional(),
  description: z.string().trim().max(300).optional().nullable(),
  imageUrl: z.string().url().max(500).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export const categoryReorderSchema = z.object({
  order: z.array(z.object({ id: uuidSchema, sortOrder: z.number().int().min(0).max(999) })).min(1).max(100),
});

const comboOptionInput = z.object({
  productId: uuidSchema,
  extraPriceCents: priceCentsSchema.optional().default(0),
  isAvailable: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).max(99).optional().default(0),
});

const comboGroupInput = z.object({
  title: z.string().trim().min(2).max(80),
  helpText: z.string().trim().max(200).optional().nullable(),
  minSelect: z.number().int().min(0).max(10),
  maxSelect: z.number().int().min(1).max(10),
  allowRepeat: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).max(99).optional().default(0),
  options: z.array(comboOptionInput).min(1, 'O grupo precisa de ao menos uma opção.').max(40),
}).refine((g) => g.maxSelect >= g.minSelect, {
  message: 'A quantidade máxima deve ser maior ou igual à mínima.',
  path: ['maxSelect'],
});

export const productInputSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do produto.').max(120),
  slug: slugSchema.optional(),
  description: z.string().trim().max(600).optional().nullable(),
  categoryId: uuidSchema.optional().nullable(),
  priceCents: priceCentsSchema.refine((v) => v > 0, 'O preço deve ser maior que zero.'),
  promoPriceCents: priceCentsSchema.optional().nullable(),
  promoStartsAt: z.string().datetime().optional().nullable(),
  promoEndsAt: z.string().datetime().optional().nullable(),
  kind: z.enum(['simple', 'combo']).optional().default('simple'),
  imageUrl: z.string().url().max(500).optional().nullable(),
  imageAlt: z.string().trim().max(200).optional().nullable(),
  isAvailable: z.boolean().optional().default(true),
  isFeatured: z.boolean().optional().default(false),
  needsReview: z.boolean().optional(),
  serves: z.number().int().min(1).max(50).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).optional().default(0),
  variants: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        priceDeltaCents: z.number().int().min(-100_000).max(100_000).default(0),
        isAvailable: z.boolean().optional().default(true),
        sortOrder: z.number().int().min(0).max(99).optional().default(0),
      }),
    )
    .max(20)
    .optional(),
  combo: z
    .object({
      instructions: z.string().trim().max(400).optional().nullable(),
      groups: z.array(comboGroupInput).min(1, 'Configure ao menos um grupo de escolha.').max(10),
    })
    .optional()
    .nullable(),
})
  .superRefine((value, ctx) => {
    if (value.promoPriceCents != null && value.promoPriceCents >= value.priceCents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['promoPriceCents'],
        message: 'O preço promocional deve ser menor que o preço cheio.',
      });
    }
    if (value.promoStartsAt && value.promoEndsAt && value.promoStartsAt >= value.promoEndsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['promoEndsAt'],
        message: 'O fim da promoção deve ser posterior ao início.',
      });
    }
    if (value.kind === 'combo' && !value.combo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['combo'],
        message: 'Combos precisam de grupos de escolha configurados.',
      });
    }
  });

export const deliveryRegionSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da região.').max(120),
  city: z.string().trim().min(2).max(120).optional(),
  feeCents: priceCentsSchema,
  minOrderCents: priceCentsSchema.optional().nullable(),
  etaMinMinutes: z.number().int().min(5).max(240).optional().nullable(),
  etaMaxMinutes: z.number().int().min(5).max(240).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).max(999).optional().default(0),
}).superRefine((value, ctx) => {
  if (value.etaMinMinutes != null && value.etaMaxMinutes != null && value.etaMinMinutes > value.etaMaxMinutes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['etaMaxMinutes'], message: 'Tempo máximo deve ser maior que o mínimo.' });
  }
});

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário no formato HH:MM.');

export const storeSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  tagline: z.string().trim().max(160).optional().nullable(),
  logoUrl: z.string().url().max(500).optional().nullable(),
  bannerUrl: z.string().url().max(500).optional().nullable(),
  instagramUrl: z.string().url().max(300).optional().nullable(),
  whatsappNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v === '' || (v.length >= 10 && v.length <= 13), { message: 'WhatsApp inválido.' })
    .optional()
    .nullable(),
  email: emailSchema.optional().nullable(),
  addressLine: z.string().trim().max(240).optional().nullable(),
  timezone: z.string().trim().max(60).optional(),
  minOrderCents: priceCentsSchema.optional(),
  etaMinMinutes: z.number().int().min(5).max(240).optional(),
  etaMaxMinutes: z.number().int().min(5).max(240).optional(),
  ratingValue: z
    .string()
    .trim()
    .regex(/^[0-5](?:[.,]\d)?$/, 'Nota entre 0 e 5, ex.: 4,9.')
    .optional()
    .nullable(),
  ratingCount: z.number().int().min(0).max(1_000_000).optional().nullable(),
  manuallyClosed: z.boolean().optional(),
  closedMessage: z.string().trim().max(240).optional().nullable(),
  announcement: z.string().trim().max(240).optional().nullable(),
  pickupEnabled: z.boolean().optional(),
  deliveryEnabled: z.boolean().optional(),
  guestCheckoutEnabled: z.boolean().optional(),
  acceptsPix: z.boolean().optional(),
  acceptsCash: z.boolean().optional(),
  acceptsCardOnDelivery: z.boolean().optional(),
  acceptsCardOnline: z.boolean().optional(),
  hours: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        opensAt: timeSchema,
        closesAt: timeSchema,
        isClosed: z.boolean(),
      }),
    )
    .max(7)
    .optional(),
});

export const adminUserInputSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema.optional(),
  role: z.enum(ADMIN_ROLES),
  isActive: z.boolean().optional().default(true),
});

export const paymentMethodsSchema = z.object({
  methods: z.array(z.enum(PAYMENT_METHODS)).max(4),
});

export const uploadQuerySchema = z.object({
  filename: z.string().trim().min(1).max(160),
  folder: z.enum(['products', 'categories', 'banners', 'brand']).default('products'),
});

export type ProductInput = z.infer<typeof productInputSchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type StoreSettingsInput = z.infer<typeof storeSettingsSchema>;
