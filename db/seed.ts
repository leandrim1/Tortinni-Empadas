import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { buildSearchText, slugify } from '../server/services/catalog';
import { normalizeNeighborhood } from '../server/services/store';
import { DEFAULT_MIN_ORDER_CENTS, STORE_INSTAGRAM_URL, STORE_NAME } from '../shared/constants';

type Db = NodePgDatabase<typeof schema>;

/**
 * Seed idempotente: identifica tudo por slug e faz upsert.
 * Rodar duas vezes não duplica nada.
 *
 * Descrições e imagens entram marcadas com `needsReview`, para o
 * administrador revisar antes de publicar como texto definitivo.
 */

const CATEGORIES = [
  { slug: 'ofertas-principais', name: 'Ofertas principais', sortOrder: 1, description: 'Os campeões de pedido da Tortinni.' },
  { slug: 'empadas-tradicionais', name: 'Empadas tradicionais', sortOrder: 2, description: 'Massa amanteigada e recheio generoso.' },
  { slug: 'empadas-especiais', name: 'Empadas especiais', sortOrder: 3, description: 'Combinações especiais da casa.' },
  { slug: 'combos', name: 'Combos', sortOrder: 4, description: 'Monte do seu jeito e economize.' },
  { slug: 'bebidas', name: 'Bebidas', sortOrder: 5, description: 'Para acompanhar sua empada.' },
];

interface SeedProduct {
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  categorySlug: string;
  isFeatured?: boolean;
  serves?: number;
  sortOrder: number;
}

const PRODUCTS: SeedProduct[] = [
  {
    slug: 'empada-frango-tradicional',
    name: 'Empada frango tradicional',
    description:
      '[Revisar] Empada de frango desfiado temperado, massa amanteigada assada na hora.',
    priceCents: 1190,
    categorySlug: 'empadas-tradicionais',
    isFeatured: true,
    sortOrder: 1,
  },
  {
    slug: 'empada-frango-cream-cheese',
    name: 'Empada de frango com cream cheese',
    description: '[Revisar] Frango desfiado com cream cheese cremoso em massa amanteigada.',
    priceCents: 1190,
    categorySlug: 'empadas-especiais',
    isFeatured: true,
    sortOrder: 2,
  },
  {
    slug: 'empada-frango-cheddar',
    name: 'Empada de frango com cheddar',
    description: '[Revisar] Frango desfiado com cheddar derretido em massa amanteigada.',
    priceCents: 1190,
    categorySlug: 'empadas-especiais',
    isFeatured: true,
    sortOrder: 3,
  },
  {
    slug: 'empada-frango-palmito',
    name: 'Empada de frango com palmito',
    description: '[Revisar] Frango desfiado com palmito picado em massa amanteigada.',
    priceCents: 1190,
    categorySlug: 'empadas-especiais',
    isFeatured: true,
    sortOrder: 4,
  },
  {
    slug: 'coca-cola-310ml',
    name: 'Coca-Cola 310 ml',
    description: 'Lata de Coca-Cola 310 ml gelada.',
    priceCents: 700,
    categorySlug: 'bebidas',
    sortOrder: 1,
  },
  {
    slug: 'coca-cola-zero-310ml',
    name: 'Coca-Cola Zero 310 ml',
    description: 'Lata de Coca-Cola Zero 310 ml gelada.',
    priceCents: 700,
    categorySlug: 'bebidas',
    sortOrder: 2,
  },
  {
    slug: 'guarana-antarctica-350ml',
    name: 'Guaraná Antarctica 350 ml',
    description: 'Lata de Guaraná Antarctica 350 ml gelada.',
    priceCents: 700,
    categorySlug: 'bebidas',
    sortOrder: 3,
  },
];

const COMBOS = [
  {
    slug: 'combo-2-empadas-refrigerante',
    name: 'Combo 2 empadas + refrigerante',
    description: 'Combo com 2 empadas grandes à sua escolha e 1 refrigerante em lata.',
    priceCents: 2790,
    sortOrder: 1,
    isFeatured: true,
    serves: null as number | null,
    groups: [
      { title: 'Escolha 2 empadas', min: 2, max: 2, source: 'empadas' as const },
      { title: 'Escolha 1 refrigerante', min: 1, max: 1, source: 'bebidas' as const },
    ],
  },
  {
    slug: 'combo-3-empadas-2-refrigerantes',
    name: 'Combo 3 empadas + 2 refrigerantes',
    description:
      'Combo com 3 empadas grandes à sua escolha e 2 refrigerantes em lata. Empadas bem recheadas, massa leve e assadas na hora. Monte do seu jeito e aproveite o combo.',
    priceCents: 4490,
    sortOrder: 2,
    isFeatured: true,
    serves: 3 as number | null,
    groups: [
      { title: 'Escolha 3 empadas', min: 3, max: 3, source: 'empadas' as const },
      { title: 'Escolha 2 refrigerantes', min: 2, max: 2, source: 'bebidas' as const },
    ],
  },
];

const REGIONS = [
  { name: 'Retirada combinada com a loja', feeCents: 0, isActive: false },
];

export async function seed(db: Db, options: { quiet?: boolean } = {}): Promise<void> {
  const log = (message: string) => {
    if (!options.quiet) console.log(message);
  };

  /* Configuração da loja */
  await db
    .insert(schema.storeSettings)
    .values({
      id: 'singleton',
      name: STORE_NAME,
      tagline: 'Empadas artesanais assadas na hora',
      instagramUrl: STORE_INSTAGRAM_URL,
      minOrderCents: DEFAULT_MIN_ORDER_CENTS,
      etaMinMinutes: 30,
      etaMaxMinutes: 50,
      timezone: 'America/Sao_Paulo',
      // Nota, telefone e endereço ficam em branco até a loja informar os dados reais.
      ratingValue: null,
      ratingCount: null,
      closedMessage: 'Estamos fechados agora. Confira os horários abaixo.',
    })
    .onConflictDoNothing({ target: schema.storeSettings.id });
  log('• Configuração da loja pronta');

  /* Horários: segunda a sábado 10h–20h, domingo fechado (ajustável no painel). */
  for (let weekday = 0; weekday <= 6; weekday++) {
    await db
      .insert(schema.storeHours)
      .values({
        weekday,
        opensAt: '10:00',
        closesAt: '20:00',
        isClosed: weekday === 0,
      })
      .onConflictDoNothing({ target: schema.storeHours.weekday });
  }
  log('• Horário de funcionamento padrão definido');

  /* Categorias */
  const categoryIds = new Map<string, string>();
  for (const category of CATEGORIES) {
    const rows = await db
      .insert(schema.categories)
      .values({
        slug: category.slug,
        name: category.name,
        description: category.description,
        sortOrder: category.sortOrder,
      })
      .onConflictDoUpdate({
        target: schema.categories.slug,
        set: { name: category.name, sortOrder: category.sortOrder },
      })
      .returning({ id: schema.categories.id });
    categoryIds.set(category.slug, rows[0]!.id);
  }
  log(`• ${CATEGORIES.length} categorias`);

  /* Produtos simples */
  const productIds = new Map<string, string>();
  for (const product of PRODUCTS) {
    const categoryId = categoryIds.get(product.categorySlug)!;
    const categoryName = CATEGORIES.find((c) => c.slug === product.categorySlug)!.name;
    const rows = await db
      .insert(schema.products)
      .values({
        slug: product.slug,
        name: product.name,
        description: product.description,
        searchText: buildSearchText([product.name, product.description, categoryName]),
        categoryId,
        priceCents: product.priceCents,
        kind: 'simple',
        isAvailable: true,
        isFeatured: product.isFeatured ?? false,
        // Texto e foto provisórios: o administrador revisa antes de publicar.
        needsReview: product.categorySlug !== 'bebidas',
        sortOrder: product.sortOrder,
      })
      .onConflictDoUpdate({
        target: schema.products.slug,
        set: {
          name: product.name,
          priceCents: product.priceCents,
          categoryId,
          updatedAt: new Date(),
        },
      })
      .returning({ id: schema.products.id });
    productIds.set(product.slug, rows[0]!.id);
  }
  log(`• ${PRODUCTS.length} produtos (empadas e bebidas)`);

  const empadaIds = PRODUCTS.filter((p) => p.slug.startsWith('empada-')).map((p) => productIds.get(p.slug)!);
  const bebidaIds = PRODUCTS.filter((p) => p.categorySlug === 'bebidas').map((p) => productIds.get(p.slug)!);

  /* Combos */
  const combosCategoryId = categoryIds.get('combos')!;
  for (const combo of COMBOS) {
    const rows = await db
      .insert(schema.products)
      .values({
        slug: combo.slug,
        name: combo.name,
        description: combo.description,
        searchText: buildSearchText([combo.name, combo.description, 'Combos']),
        categoryId: combosCategoryId,
        priceCents: combo.priceCents,
        kind: 'combo',
        isAvailable: true,
        isFeatured: combo.isFeatured,
        serves: combo.serves,
        sortOrder: combo.sortOrder,
      })
      .onConflictDoUpdate({
        target: schema.products.slug,
        set: {
          name: combo.name,
          description: combo.description,
          priceCents: combo.priceCents,
          serves: combo.serves,
          updatedAt: new Date(),
        },
      })
      .returning({ id: schema.products.id });
    const comboProductId = rows[0]!.id;

    // Recria a estrutura de escolhas para refletir o catálogo atual.
    await db.delete(schema.combos).where(eq(schema.combos.productId, comboProductId));
    const comboRows = await db
      .insert(schema.combos)
      .values({ productId: comboProductId, instructions: 'Escolha os sabores e as bebidas do seu combo.' })
      .returning({ id: schema.combos.id });
    const comboId = comboRows[0]!.id;

    for (const [index, group] of combo.groups.entries()) {
      const groupRows = await db
        .insert(schema.comboGroups)
        .values({
          comboId,
          title: group.title,
          minSelect: group.min,
          maxSelect: group.max,
          allowRepeat: true,
          sortOrder: index,
        })
        .returning({ id: schema.comboGroups.id });
      const groupId = groupRows[0]!.id;

      const optionIds = group.source === 'empadas' ? empadaIds : bebidaIds;
      await db.insert(schema.comboOptions).values(
        optionIds.map((productId, optionIndex) => ({
          groupId,
          productId,
          extraPriceCents: 0,
          isAvailable: true,
          sortOrder: optionIndex,
        })),
      );
    }
  }
  log(`• ${COMBOS.length} combos com grupos de escolha`);

  /* Região de entrega de exemplo, desativada: taxas reais são cadastradas no painel. */
  for (const region of REGIONS) {
    await db
      .insert(schema.deliveryRegions)
      .values({
        name: region.name,
        neighborhoodKey: normalizeNeighborhood(region.name) || slugify(region.name),
        feeCents: region.feeCents,
        isActive: region.isActive,
      })
      .onConflictDoNothing({ target: schema.deliveryRegions.neighborhoodKey });
  }

  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.products);
  log(`Seed concluído. Produtos no catálogo: ${total}`);
}
