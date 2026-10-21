import { z } from 'zod';
import { badRequest } from '../lib/errors';

export const uuidSchema = z.string().uuid('Identificador inválido.');

export const emailSchema = z
  .string()
  .trim()
  .min(5, 'Informe um e-mail válido.')
  .max(254, 'E-mail muito longo.')
  .email('Informe um e-mail válido.')
  .transform((v) => v.toLowerCase());

/** Aceita qualquer provedor de e-mail — não exigimos Gmail. */
export const passwordSchema = z
  .string()
  .min(8, 'A senha precisa ter ao menos 8 caracteres.')
  .max(128, 'A senha pode ter no máximo 128 caracteres.')
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), {
    message: 'A senha precisa ter letras e números.',
  });

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Informe o nome completo.')
  .max(120, 'Nome muito longo.');

/** Telefone brasileiro: 10 ou 11 dígitos após remover máscara. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length >= 10 && v.length <= 11, {
    message: 'Informe um telefone com DDD, ex.: (11) 99999-9999.',
  });

export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug deve conter apenas letras minúsculas, números e hífens.');

export const priceCentsSchema = z
  .number()
  .int('Valor deve estar em centavos inteiros.')
  .min(0, 'Valor não pode ser negativo.')
  .max(100_000_00, 'Valor acima do permitido.');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

export type Pagination = z.infer<typeof paginationSchema>;

/** Valida e converte erros do zod em AppError 400 com detalhes por campo. */
export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || '_',
      message: issue.message,
    }));
    throw badRequest(details[0]?.message ?? 'Dados inválidos.', details);
  }
  return result.data;
}

export function parseQuery<T extends z.ZodTypeAny>(schema: T, query: URLSearchParams): z.infer<T> {
  const obj: Record<string, string> = {};
  for (const [key, value] of query.entries()) obj[key] = value;
  return parseOrThrow(schema, obj);
}
