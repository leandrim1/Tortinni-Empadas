import type { Product, Category, StorePayload } from '@/types/catalog';
import { products as demoProducts, categories as demoCategories, storePayload } from './catalog-data';

/**
 * Cliente da API.
 *
 * Hoje a vitrine roda com o catálogo local para aprovação visual. Quando o
 * backend estiver no ar, basta `VITE_API_MODE=live`: as funções abaixo passam
 * a falar com `/api/*` devolvendo exatamente o mesmo formato.
 */

const MODE = (import.meta.env.VITE_API_MODE as string | undefined) ?? 'local';
export const isLiveMode = MODE === 'live';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
      ...csrfHeader(),
    },
    ...init,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  };

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload.error?.message ?? 'Não foi possível completar a ação. Tente novamente.',
      payload.error?.code,
    );
  }
  return payload as T;
}

function csrfHeader(): Record<string, string> {
  const match = document.cookie.match(/(?:^|;\s*)tortinni_csrf=([^;]+)/);
  return match?.[1] ? { 'X-CSRF-Token': decodeURIComponent(match[1]) } : {};
}

/** Pequeno atraso só no modo local, para os estados de carregamento serem reais. */
function settle<T>(value: T, ms = 140): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export async function fetchStore(): Promise<StorePayload> {
  if (isLiveMode) return request<StorePayload>('/store');
  return settle(storePayload);
}

export async function fetchCategories(): Promise<Category[]> {
  if (isLiveMode) return (await request<{ categories: Category[] }>('/categories')).categories;
  return settle(demoCategories);
}

export interface ProductQuery {
  category?: string;
  search?: string;
  featured?: boolean;
}

export async function fetchProducts(query: ProductQuery = {}): Promise<Product[]> {
  if (isLiveMode) {
    const params = new URLSearchParams();
    if (query.category) params.set('category', query.category);
    if (query.search) params.set('search', query.search);
    if (query.featured) params.set('featured', 'true');
    params.set('pageSize', '60');
    const page = await request<{ items: Product[] }>(`/products?${params.toString()}`);
    return page.items;
  }

  let items = demoProducts;
  if (query.featured) items = items.filter((p) => p.isFeatured);
  if (query.category) items = items.filter((p) => p.categorySlug === query.category);
  if (query.search) {
    const term = normalize(query.search);
    items = items.filter((product) =>
      normalize(
        [product.name, product.description, product.categoryName].filter(Boolean).join(' '),
      ).includes(term),
    );
  }
  return settle(items);
}

export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
