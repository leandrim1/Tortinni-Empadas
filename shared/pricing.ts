/**
 * Motor de preços. É puro de propósito: o servidor o alimenta com dados lidos
 * do banco (fonte da verdade) e o navegador com o catálogo já carregado, para
 * exibir o carrinho sem esperar a rede. O total que vale é sempre o do servidor.
 */

export interface PricingOption {
  productId: string;
  name: string;
  extraPriceCents: number;
  isAvailable: boolean;
}

export interface PricingGroup {
  id: string;
  title: string;
  minSelect: number;
  maxSelect: number;
  allowRepeat: boolean;
  options: PricingOption[];
}

export interface PricingVariant {
  id: string;
  name: string;
  priceDeltaCents: number;
  isAvailable: boolean;
}

export interface PricingProduct {
  id: string;
  name: string;
  priceCents: number;
  promoPriceCents?: number | null;
  promoStartsAt?: string | Date | null;
  promoEndsAt?: string | Date | null;
  isAvailable: boolean;
  kind: 'simple' | 'combo';
  variants?: PricingVariant[];
  comboGroups?: PricingGroup[];
}

export interface CartSelectionInput {
  groupId: string;
  optionProductIds: string[];
}

export interface CartItemInput {
  productId: string;
  quantity: number;
  variantId?: string | null;
  selections?: CartSelectionInput[];
  notes?: string;
}

export interface PricedOption {
  groupId: string;
  groupTitle: string;
  optionProductId: string;
  label: string;
  quantity: number;
  priceDeltaCents: number;
}

export interface PricedItem {
  productId: string;
  name: string;
  /** Preço unitário já com variação e acréscimos das escolhas. */
  unitPriceCents: number;
  basePriceCents: number;
  quantity: number;
  totalCents: number;
  options: PricedOption[];
  variantId?: string | null;
  notes?: string;
}

export interface PricingIssue {
  productId?: string;
  code:
    | 'product_not_found'
    | 'product_unavailable'
    | 'invalid_quantity'
    | 'variant_invalid'
    | 'combo_group_missing'
    | 'combo_selection_count'
    | 'combo_option_invalid'
    | 'combo_option_unavailable'
    | 'combo_repeat_not_allowed';
  message: string;
}

export interface PricedCart {
  items: PricedItem[];
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  minOrderCents: number;
  meetsMinimum: boolean;
  missingForMinimumCents: number;
  issues: PricingIssue[];
}

export interface PricingContext {
  products: Map<string, PricingProduct>;
  minOrderCents: number;
  deliveryFeeCents?: number;
  now?: Date;
}

/** Preço efetivo: promoção só vale dentro da janela configurada. */
export function effectivePriceCents(product: PricingProduct, now: Date = new Date()): number {
  const promo = product.promoPriceCents;
  if (promo == null || promo <= 0 || promo >= product.priceCents) return product.priceCents;
  const starts = product.promoStartsAt ? new Date(product.promoStartsAt) : null;
  const ends = product.promoEndsAt ? new Date(product.promoEndsAt) : null;
  if (starts && now < starts) return product.priceCents;
  if (ends && now > ends) return product.priceCents;
  return promo;
}

export function hasActivePromo(product: PricingProduct, now: Date = new Date()): boolean {
  return effectivePriceCents(product, now) < product.priceCents;
}

const MAX_QUANTITY = 30;

/**
 * Calcula o carrinho inteiro. Nunca lança: devolve `issues` para que a
 * interface possa explicar exatamente o que impede o pedido.
 */
export function priceCart(items: CartItemInput[], context: PricingContext): PricedCart {
  const now = context.now ?? new Date();
  const issues: PricingIssue[] = [];
  const priced: PricedItem[] = [];

  for (const item of items) {
    const product = context.products.get(item.productId);
    if (!product) {
      issues.push({
        productId: item.productId,
        code: 'product_not_found',
        message: 'Um item do carrinho não está mais disponível no cardápio.',
      });
      continue;
    }
    if (!product.isAvailable) {
      issues.push({
        productId: item.productId,
        code: 'product_unavailable',
        message: `${product.name} está indisponível no momento.`,
      });
      continue;
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) {
      issues.push({
        productId: item.productId,
        code: 'invalid_quantity',
        message: `Quantidade inválida para ${product.name}.`,
      });
      continue;
    }

    let unit = effectivePriceCents(product, now);
    const basePriceCents = unit;

    if (item.variantId) {
      const variant = product.variants?.find((v) => v.id === item.variantId);
      if (!variant || !variant.isAvailable) {
        issues.push({
          productId: item.productId,
          code: 'variant_invalid',
          message: `A opção escolhida para ${product.name} não está disponível.`,
        });
        continue;
      }
      unit += variant.priceDeltaCents;
    }

    const options: PricedOption[] = [];
    const groups = product.comboGroups ?? [];
    let itemFailed = false;

    for (const group of groups) {
      const selection = item.selections?.find((s) => s.groupId === group.id);
      const chosen = selection?.optionProductIds ?? [];

      if (chosen.length < group.minSelect || chosen.length > group.maxSelect) {
        issues.push({
          productId: item.productId,
          code: 'combo_selection_count',
          message:
            group.minSelect === group.maxSelect
              ? `Escolha ${group.minSelect} ${group.minSelect === 1 ? 'item' : 'itens'} em "${group.title}".`
              : `Escolha de ${group.minSelect} a ${group.maxSelect} itens em "${group.title}".`,
        });
        itemFailed = true;
        break;
      }

      if (!group.allowRepeat && new Set(chosen).size !== chosen.length) {
        issues.push({
          productId: item.productId,
          code: 'combo_repeat_not_allowed',
          message: `Em "${group.title}" não é possível repetir a mesma opção.`,
        });
        itemFailed = true;
        break;
      }

      const counts = new Map<string, number>();
      for (const optionProductId of chosen) {
        const option = group.options.find((o) => o.productId === optionProductId);
        if (!option) {
          issues.push({
            productId: item.productId,
            code: 'combo_option_invalid',
            message: `Uma escolha de "${group.title}" não faz parte deste combo.`,
          });
          itemFailed = true;
          break;
        }
        if (!option.isAvailable) {
          issues.push({
            productId: item.productId,
            code: 'combo_option_unavailable',
            message: `${option.name} está indisponível para este combo.`,
          });
          itemFailed = true;
          break;
        }
        unit += option.extraPriceCents;
        counts.set(optionProductId, (counts.get(optionProductId) ?? 0) + 1);
      }
      if (itemFailed) break;

      for (const [optionProductId, quantity] of counts) {
        const option = group.options.find((o) => o.productId === optionProductId)!;
        options.push({
          groupId: group.id,
          groupTitle: group.title,
          optionProductId,
          label: option.name,
          quantity,
          priceDeltaCents: option.extraPriceCents,
        });
      }
    }

    // Escolhas enviadas para grupos que não existem neste produto.
    if (!itemFailed && item.selections) {
      for (const selection of item.selections) {
        if (!groups.some((g) => g.id === selection.groupId)) {
          issues.push({
            productId: item.productId,
            code: 'combo_group_missing',
            message: `Há uma escolha inválida em ${product.name}.`,
          });
          itemFailed = true;
          break;
        }
      }
    }

    if (itemFailed) continue;

    priced.push({
      productId: product.id,
      name: product.name,
      unitPriceCents: unit,
      basePriceCents,
      quantity: item.quantity,
      totalCents: unit * item.quantity,
      options,
      variantId: item.variantId ?? null,
      notes: item.notes,
    });
  }

  const subtotalCents = priced.reduce((sum, item) => sum + item.totalCents, 0);
  const deliveryFeeCents = context.deliveryFeeCents ?? 0;
  const discountCents = 0;
  const totalCents = Math.max(0, subtotalCents + deliveryFeeCents - discountCents);
  const meetsMinimum = subtotalCents >= context.minOrderCents;

  return {
    items: priced,
    subtotalCents,
    deliveryFeeCents,
    discountCents,
    totalCents,
    minOrderCents: context.minOrderCents,
    meetsMinimum,
    missingForMinimumCents: meetsMinimum ? 0 : context.minOrderCents - subtotalCents,
    issues,
  };
}
