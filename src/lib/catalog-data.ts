import type { Product, Category, StorePayload } from '@/types/catalog';

/**
 * Catálogo de apresentação.
 *
 * Preços, nomes e descrições são os reais da Tortinni; as fotos são as
 * enviadas pela loja. Este módulo existe para que a vitrine possa ser
 * navegada e aprovada antes do banco entrar no ar — o formato é idêntico
 * ao de `GET /api/products`, então ligar a API não muda uma linha da UI.
 */

export const DEMO_MODE_NOTE =
  'Vitrine de aprovação: catálogo carregado do arquivo local. Ao conectar o banco, os mesmos dados passam a vir da API.';

const CATEGORY_IDS = {
  ofertas: 'c0000000-0000-4000-8000-000000000001',
  tradicionais: 'c0000000-0000-4000-8000-000000000002',
  especiais: 'c0000000-0000-4000-8000-000000000003',
  combos: 'c0000000-0000-4000-8000-000000000004',
  bebidas: 'c0000000-0000-4000-8000-000000000005',
} as const;

export const categories: Category[] = [
  {
    id: CATEGORY_IDS.ofertas,
    slug: 'ofertas-principais',
    name: 'Ofertas principais',
    description: 'Os campeões de pedido da casa.',
    imageUrl: null,
    sortOrder: 1,
  },
  {
    id: CATEGORY_IDS.tradicionais,
    slug: 'empadas-tradicionais',
    name: 'Empadas tradicionais',
    description: 'Massa amanteigada e recheio generoso.',
    imageUrl: null,
    sortOrder: 2,
  },
  {
    id: CATEGORY_IDS.especiais,
    slug: 'empadas-especiais',
    name: 'Empadas especiais',
    description: 'Combinações especiais da casa.',
    imageUrl: null,
    sortOrder: 3,
  },
  {
    id: CATEGORY_IDS.combos,
    slug: 'combos',
    name: 'Combos',
    description: 'Monte do seu jeito e economize.',
    imageUrl: null,
    sortOrder: 4,
  },
  {
    id: CATEGORY_IDS.bebidas,
    slug: 'bebidas',
    name: 'Bebidas',
    description: 'Geladas, para acompanhar.',
    imageUrl: null,
    sortOrder: 5,
  },
];

const P = {
  tradicional: 'p0000000-0000-4000-8000-000000000001',
  creamCheese: 'p0000000-0000-4000-8000-000000000002',
  cheddar: 'p0000000-0000-4000-8000-000000000003',
  palmito: 'p0000000-0000-4000-8000-000000000004',
  coca: 'p0000000-0000-4000-8000-000000000005',
  cocaZero: 'p0000000-0000-4000-8000-000000000006',
  guarana: 'p0000000-0000-4000-8000-000000000007',
  combo2: 'p0000000-0000-4000-8000-000000000008',
  combo3: 'p0000000-0000-4000-8000-000000000009',
} as const;

const G = {
  combo2Empadas: 'g0000000-0000-4000-8000-000000000001',
  combo2Bebida: 'g0000000-0000-4000-8000-000000000002',
  combo3Empadas: 'g0000000-0000-4000-8000-000000000003',
  combo3Bebidas: 'g0000000-0000-4000-8000-000000000004',
} as const;

const EMPADA_PRICE = 1190;
const DRINK_PRICE = 700;

interface Base {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  image: string | null;
  imageAlt: string | null;
  category: keyof typeof CATEGORY_IDS;
  featured?: boolean;
  needsReview?: boolean;
  sortOrder: number;
}

const BASE: Base[] = [
  {
    id: P.tradicional,
    slug: 'empada-frango-tradicional',
    name: 'Empada frango tradicional',
    description: 'Frango desfiado temperado em massa amanteigada, assada na hora.',
    priceCents: EMPADA_PRICE,
    image: 'empada',
    imageAlt: 'Empada de frango assada, massa dourada',
    category: 'tradicionais',
    featured: true,
    needsReview: true,
    sortOrder: 1,
  },
  {
    id: P.creamCheese,
    slug: 'empada-frango-cream-cheese',
    name: 'Empada de frango com cream cheese',
    description: 'Frango desfiado com cream cheese cremoso em massa amanteigada.',
    priceCents: EMPADA_PRICE,
    image: 'empada',
    imageAlt: 'Empada de frango assada, massa dourada',
    category: 'especiais',
    featured: true,
    needsReview: true,
    sortOrder: 2,
  },
  {
    id: P.cheddar,
    slug: 'empada-frango-cheddar',
    name: 'Empada de frango com cheddar',
    description: 'Frango desfiado com cheddar derretido em massa amanteigada.',
    priceCents: EMPADA_PRICE,
    image: 'empada',
    imageAlt: 'Empada de frango assada, massa dourada',
    category: 'especiais',
    featured: true,
    needsReview: true,
    sortOrder: 3,
  },
  {
    id: P.palmito,
    slug: 'empada-frango-palmito',
    name: 'Empada de frango com palmito',
    description: 'Frango desfiado com palmito picado em massa amanteigada.',
    priceCents: EMPADA_PRICE,
    image: 'empada',
    imageAlt: 'Empada de frango assada, massa dourada',
    category: 'especiais',
    featured: true,
    needsReview: true,
    sortOrder: 4,
  },
  {
    id: P.coca,
    slug: 'coca-cola-310ml',
    name: 'Coca-Cola 310 ml',
    description: 'Lata de Coca-Cola 310 ml gelada.',
    priceCents: DRINK_PRICE,
    image: 'coca-cola',
    imageAlt: 'Lata de Coca-Cola 310 ml',
    category: 'bebidas',
    sortOrder: 1,
  },
  {
    id: P.cocaZero,
    slug: 'coca-cola-zero-310ml',
    name: 'Coca-Cola Zero 310 ml',
    description: 'Lata de Coca-Cola Zero 310 ml gelada.',
    priceCents: DRINK_PRICE,
    // Sem foto própria ainda: o card mostra um marcador, não a lata de outro sabor.
    image: null,
    imageAlt: null,
    category: 'bebidas',
    sortOrder: 2,
  },
  {
    id: P.guarana,
    slug: 'guarana-antarctica-350ml',
    name: 'Guaraná Antarctica 350 ml',
    description: 'Lata de Guaraná Antarctica 350 ml gelada.',
    priceCents: DRINK_PRICE,
    // Sem foto própria ainda: o card mostra um marcador, não a lata de outro sabor.
    image: null,
    imageAlt: null,
    category: 'bebidas',
    sortOrder: 3,
  },
];

function imageUrl(name: string | null, width: 400 | 800 = 400, transparent = false): string | null {
  if (!name) return null;
  return `/images/produtos/${name}-${width}${transparent ? '-alpha' : ''}.webp`;
}

/** Versão sem fundo, para cards sobre o verde escuro. */
function cutoutUrl(name: string | null): string | null {
  return imageUrl(name, 400, true);
}

function toProduct(base: Base): Product {
  const category = categories.find((c) => c.slug === categorySlugFor(base.category))!;
  return {
    id: base.id,
    slug: base.slug,
    name: base.name,
    description: base.description,
    priceCents: base.priceCents,
    promoPriceCents: null,
    promoStartsAt: null,
    promoEndsAt: null,
    kind: 'simple',
    imageUrl: imageUrl(base.image),
    cutoutUrl: cutoutUrl(base.image),
    imageAlt: base.imageAlt,
    isAvailable: true,
    isFeatured: base.featured ?? false,
    needsReview: base.needsReview ?? false,
    serves: null,
    categoryId: category.id,
    categorySlug: category.slug,
    categoryName: category.name,
    variants: [],
    comboGroups: [],
    currentPriceCents: base.priceCents,
    hasPromo: false,
  };
}

function categorySlugFor(key: Base['category']): string {
  switch (key) {
    case 'ofertas':
      return 'ofertas-principais';
    case 'tradicionais':
      return 'empadas-tradicionais';
    case 'especiais':
      return 'empadas-especiais';
    case 'combos':
      return 'combos';
    case 'bebidas':
      return 'bebidas';
  }
}

const simpleProducts = BASE.map(toProduct);

const empadaOptions = BASE.filter((b) => b.slug.startsWith('empada-')).map((b) => ({
  productId: b.id,
  name: b.name,
  extraPriceCents: 0,
  isAvailable: true,
}));

const bebidaOptions = BASE.filter((b) => b.category === 'bebidas').map((b) => ({
  productId: b.id,
  name: b.name,
  extraPriceCents: 0,
  isAvailable: true,
}));

const combosCategory = categories.find((c) => c.slug === 'combos')!;

const comboProducts: Product[] = [
  {
    id: P.combo2,
    slug: 'combo-2-empadas-refrigerante',
    name: 'Combo 2 empadas + refrigerante',
    description: 'Combo com 2 empadas grandes à sua escolha e 1 refrigerante em lata.',
    priceCents: 2790,
    promoPriceCents: null,
    promoStartsAt: null,
    promoEndsAt: null,
    kind: 'combo',
    imageUrl: imageUrl('combo'),
    cutoutUrl: cutoutUrl('combo'),
    imageAlt: 'Combo com empadas, lata de Coca-Cola e gelo sobre tábua de madeira',
    isAvailable: true,
    isFeatured: true,
    needsReview: false,
    serves: null,
    categoryId: combosCategory.id,
    categorySlug: combosCategory.slug,
    categoryName: combosCategory.name,
    variants: [],
    comboGroups: [
      {
        id: G.combo2Empadas,
        title: 'Escolha 2 empadas',
        minSelect: 2,
        maxSelect: 2,
        allowRepeat: true,
        options: empadaOptions,
      },
      {
        id: G.combo2Bebida,
        title: 'Escolha 1 refrigerante',
        minSelect: 1,
        maxSelect: 1,
        allowRepeat: true,
        options: bebidaOptions,
      },
    ],
    currentPriceCents: 2790,
    hasPromo: false,
  },
  {
    id: P.combo3,
    slug: 'combo-3-empadas-2-refrigerantes',
    name: 'Combo 3 empadas + 2 refrigerantes',
    description:
      'Combo com 3 empadas grandes à sua escolha e 2 refrigerantes em lata. Empadas bem recheadas, massa leve e assadas na hora. Monte do seu jeito e aproveite o combo.',
    priceCents: 4490,
    promoPriceCents: null,
    promoStartsAt: null,
    promoEndsAt: null,
    kind: 'combo',
    imageUrl: imageUrl('combo'),
    cutoutUrl: cutoutUrl('combo'),
    imageAlt: 'Combo com empadas, lata de Coca-Cola e gelo sobre tábua de madeira',
    isAvailable: true,
    isFeatured: true,
    needsReview: false,
    serves: 3,
    categoryId: combosCategory.id,
    categorySlug: combosCategory.slug,
    categoryName: combosCategory.name,
    variants: [],
    comboGroups: [
      {
        id: G.combo3Empadas,
        title: 'Escolha 3 empadas',
        minSelect: 3,
        maxSelect: 3,
        allowRepeat: true,
        options: empadaOptions,
      },
      {
        id: G.combo3Bebidas,
        title: 'Escolha 2 refrigerantes',
        minSelect: 2,
        maxSelect: 2,
        allowRepeat: true,
        options: bebidaOptions,
      },
    ],
    currentPriceCents: 4490,
    hasPromo: false,
  },
];

export const products: Product[] = [...simpleProducts, ...comboProducts];

/** Imagem grande e transparente usada no hero e nos destaques. */
export const HERO_IMAGE = {
  webp: '/images/produtos/combo-800-alpha.webp',
  png: '/images/produtos/combo-800-alpha.png',
  alt: 'Empadas Tortinni com lata de Coca-Cola e gelo sobre tábua de madeira',
};

export const EMPADA_IMAGE = {
  webp: '/images/produtos/empada-800-alpha.webp',
  png: '/images/produtos/empada-800-alpha.png',
  alt: 'Empada de frango da Tortinni, massa dourada assada na hora',
};

export const storePayload: StorePayload = {
  store: {
    name: 'Tortinni Empadas',
    tagline: 'Empadas artesanais assadas na hora',
    logoUrl: null,
    bannerUrl: null,
    instagramUrl: 'https://www.instagram.com/tortinnisalgados',
    whatsappNumber: null,
    addressLine: null,
    minOrderCents: 2000,
    etaMinMinutes: 30,
    etaMaxMinutes: 50,
    // Nota exibida apenas quando a loja confirmar o número real.
    rating: null,
    announcement: null,
    pickupEnabled: true,
    deliveryEnabled: true,
    guestCheckoutEnabled: true,
  },
  status: { isOpen: true, reason: 'open', message: 'Aberto agora', todayClosesAt: '20:00' },
  hours: [
    { weekday: 0, opensAt: '10:00', closesAt: '20:00', isClosed: true },
    { weekday: 1, opensAt: '10:00', closesAt: '20:00', isClosed: false },
    { weekday: 2, opensAt: '10:00', closesAt: '20:00', isClosed: false },
    { weekday: 3, opensAt: '10:00', closesAt: '20:00', isClosed: false },
    { weekday: 4, opensAt: '10:00', closesAt: '20:00', isClosed: false },
    { weekday: 5, opensAt: '10:00', closesAt: '20:00', isClosed: false },
    { weekday: 6, opensAt: '10:00', closesAt: '20:00', isClosed: false },
  ],
  // Taxas e bairros reais são cadastrados no painel; nada é inventado aqui.
  regions: [],
  paymentMethods: [
    { method: 'pix', enabled: true, note: 'Chave enviada pela loja após a confirmação.' },
    { method: 'cash', enabled: true },
    { method: 'card_on_delivery', enabled: true },
  ],
  integrations: { onlinePayment: false, imageStorage: false, email: false },
};
