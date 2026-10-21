import { z } from 'zod';
import { emailSchema, passwordSchema, nameSchema, phoneSchema } from './common';

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema.optional(),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe a senha.').max(128),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(16, 'Token inválido.').max(256),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(16).max(256),
});

export const updateProfileSchema = z.object({
  name: nameSchema.optional(),
  phone: phoneSchema.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const addressSchema = z.object({
  label: z.string().trim().max(60).optional(),
  street: z.string().trim().min(3, 'Informe a rua.').max(160),
  number: z.string().trim().min(1, 'Informe o número.').max(20),
  complement: z.string().trim().max(120).optional(),
  neighborhood: z.string().trim().min(2, 'Informe o bairro.').max(120),
  city: z.string().trim().min(2, 'Informe a cidade.').max(120),
  state: z.string().trim().length(2, 'UF com 2 letras.').optional(),
  postalCode: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v === '' || v.length === 8, { message: 'CEP deve ter 8 dígitos.' })
    .optional(),
  reference: z.string().trim().max(200).optional(),
  isDefault: z.boolean().optional(),
});

export const adminLoginSchema = loginSchema;

export const bootstrapAdminSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});
