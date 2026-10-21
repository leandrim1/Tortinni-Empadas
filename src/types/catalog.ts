import type { PricingProduct, PricingGroup, PricedCart, PricedItem } from '@shared/pricing';

/** Mesmo formato devolvido por GET /api/products — trocar a fonte não muda a UI. */
export interface Product extends PricingProduct {
  slug: string;
  description: string | null;
  imageUrl: string | null;
  /** Mesma foto sem fundo, para exibição sobre seções escuras. */
  cutoutUrl?: string | null;
  imageAlt: string | null;
  categoryId: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  isFeatured: boolean;
  needsReview: boolean;
  serves: number | null;
  currentPriceCents: number;
  hasPromo: boolean;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
}

export interface StoreStatus {
  isOpen: boolean;
  reason: 'open' | 'manually_closed' | 'outside_hours' | 'no_hours_configured';
  message: string;
  todayOpensAt?: string;
  todayClosesAt?: string;
}

export interface StoreHour {
  weekday: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

export interface DeliveryRegion {
  id: string;
  name: string;
  feeCents: number;
  minOrderCents: number | null;
  etaMinMinutes: number | null;
  etaMaxMinutes: number | null;
}

export interface StoreInfo {
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  instagramUrl: string | null;
  whatsappNumber: string | null;
  addressLine: string | null;
  minOrderCents: number;
  etaMinMinutes: number;
  etaMaxMinutes: number;
  /** Só existe quando a loja informa a nota real. Nunca inventada. */
  rating: { value: string; count: number | null } | null;
  announcement: string | null;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  guestCheckoutEnabled: boolean;
}

export interface StorePayload {
  store: StoreInfo;
  status: StoreStatus;
  hours: StoreHour[];
  regions: DeliveryRegion[];
  paymentMethods: { method: string; enabled: boolean; note?: string }[];
  integrations: { onlinePayment: boolean; imageStorage: boolean; email: boolean };
}

export type { PricingGroup, PricedCart, PricedItem };
