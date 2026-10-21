export const STORE_NAME = 'Tortinni Empadas';
export const STORE_INSTAGRAM_URL = 'https://www.instagram.com/tortinnisalgados';
export const STORE_INSTAGRAM_HANDLE = '@tortinnisalgados';

/** Pedido mínimo padrão (R$ 20,00) — configurável no painel. */
export const DEFAULT_MIN_ORDER_CENTS = 2000;

export const MAX_ITEM_QUANTITY = 30;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

export const ADMIN_ROLES = ['admin', 'operator'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const WEEKDAYS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const;
