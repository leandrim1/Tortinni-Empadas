import { describe, it, expect } from 'vitest';
import { priceCart, effectivePriceCents, type PricingProduct } from '../../shared/pricing';

const empada = (id: string, name: string): PricingProduct => ({
  id,
  name,
  priceCents: 1190,
  isAvailable: true,
  kind: 'simple',
});

const coca: PricingProduct = {
  id: 'coca',
  name: 'Coca-Cola 310 ml',
  priceCents: 700,
  isAvailable: true,
  kind: 'simple',
};

const combo3: PricingProduct = {
  id: 'combo3',
  name: 'Combo 3 empadas + 2 refrigerantes',
  priceCents: 4490,
  isAvailable: true,
  kind: 'combo',
  comboGroups: [
    {
      id: 'g-empadas',
      title: 'Escolha 3 empadas',
      minSelect: 3,
      maxSelect: 3,
      allowRepeat: true,
      options: [
        { productId: 'e1', name: 'Tradicional', extraPriceCents: 0, isAvailable: true },
        { productId: 'e2', name: 'Cheddar', extraPriceCents: 0, isAvailable: true },
        { productId: 'e3', name: 'Palmito', extraPriceCents: 0, isAvailable: false },
      ],
    },
    {
      id: 'g-bebidas',
      title: 'Escolha 2 refrigerantes',
      minSelect: 2,
      maxSelect: 2,
      allowRepeat: true,
      options: [{ productId: 'coca', name: 'Coca-Cola 310 ml', extraPriceCents: 0, isAvailable: true }],
    },
  ],
};

function contextWith(products: PricingProduct[], minOrderCents = 2000) {
  return { products: new Map(products.map((p) => [p.id, p])), minOrderCents };
}

describe('cálculo do carrinho', () => {
  it('soma itens simples por quantidade', () => {
    const result = priceCart(
      [
        { productId: 'e1', quantity: 2 },
        { productId: 'coca', quantity: 1 },
      ],
      contextWith([empada('e1', 'Tradicional'), coca]),
    );

    expect(result.issues).toEqual([]);
    expect(result.subtotalCents).toBe(1190 * 2 + 700);
    expect(result.totalCents).toBe(3080);
  });

  it('aplica a taxa de entrega no total, mas não no mínimo', () => {
    const result = priceCart([{ productId: 'e1', quantity: 1 }], {
      ...contextWith([empada('e1', 'Tradicional')]),
      deliveryFeeCents: 800,
    });

    expect(result.subtotalCents).toBe(1190);
    expect(result.totalCents).toBe(1990);
    // O mínimo olha o subtotal: a taxa não "completa" o pedido mínimo.
    expect(result.meetsMinimum).toBe(false);
    expect(result.missingForMinimumCents).toBe(810);
  });

  it('sinaliza quando o pedido mínimo não é atingido', () => {
    const result = priceCart([{ productId: 'coca', quantity: 1 }], contextWith([coca]));
    expect(result.meetsMinimum).toBe(false);
    expect(result.missingForMinimumCents).toBe(1300);
  });

  it('reconhece o pedido mínimo atingido na igualdade', () => {
    const result = priceCart([{ productId: 'coca', quantity: 1 }], contextWith([coca], 700));
    expect(result.meetsMinimum).toBe(true);
    expect(result.missingForMinimumCents).toBe(0);
  });

  it('recusa produto indisponível', () => {
    const indisponivel = { ...empada('e1', 'Tradicional'), isAvailable: false };
    const result = priceCart([{ productId: 'e1', quantity: 1 }], contextWith([indisponivel]));

    expect(result.items).toHaveLength(0);
    expect(result.issues[0]?.code).toBe('product_unavailable');
  });

  it('recusa produto que não existe mais no cardápio', () => {
    const result = priceCart([{ productId: 'fantasma', quantity: 1 }], contextWith([coca]));
    expect(result.issues[0]?.code).toBe('product_not_found');
  });

  it('recusa quantidade inválida', () => {
    const result = priceCart(
      [{ productId: 'e1', quantity: 0 }],
      contextWith([empada('e1', 'Tradicional')]),
    );
    expect(result.issues[0]?.code).toBe('invalid_quantity');
  });
});

describe('montagem de combos', () => {
  const context = contextWith([combo3], 2000);

  it('aceita o combo com todas as escolhas completas', () => {
    const result = priceCart(
      [
        {
          productId: 'combo3',
          quantity: 1,
          selections: [
            { groupId: 'g-empadas', optionProductIds: ['e1', 'e1', 'e2'] },
            { groupId: 'g-bebidas', optionProductIds: ['coca', 'coca'] },
          ],
        },
      ],
      context,
    );

    expect(result.issues).toEqual([]);
    expect(result.subtotalCents).toBe(4490);
    // Sabores repetidos são agrupados com a quantidade.
    const empadas = result.items[0]?.options.find((o) => o.optionProductId === 'e1');
    expect(empadas?.quantity).toBe(2);
  });

  it('recusa combo com escolhas faltando', () => {
    const result = priceCart(
      [
        {
          productId: 'combo3',
          quantity: 1,
          selections: [{ groupId: 'g-empadas', optionProductIds: ['e1', 'e2'] }],
        },
      ],
      context,
    );

    expect(result.items).toHaveLength(0);
    expect(result.issues[0]?.code).toBe('combo_selection_count');
    expect(result.issues[0]?.message).toContain('Escolha 3');
  });

  it('recusa escolha de item indisponível dentro do combo', () => {
    const result = priceCart(
      [
        {
          productId: 'combo3',
          quantity: 1,
          selections: [
            { groupId: 'g-empadas', optionProductIds: ['e1', 'e2', 'e3'] },
            { groupId: 'g-bebidas', optionProductIds: ['coca', 'coca'] },
          ],
        },
      ],
      context,
    );
    expect(result.issues[0]?.code).toBe('combo_option_unavailable');
  });

  it('recusa opção que não pertence ao combo', () => {
    const result = priceCart(
      [
        {
          productId: 'combo3',
          quantity: 1,
          selections: [
            { groupId: 'g-empadas', optionProductIds: ['e1', 'e2', 'intruso'] },
            { groupId: 'g-bebidas', optionProductIds: ['coca', 'coca'] },
          ],
        },
      ],
      context,
    );
    expect(result.issues[0]?.code).toBe('combo_option_invalid');
  });

  it('recusa grupo que não existe no produto', () => {
    const result = priceCart(
      [
        {
          productId: 'combo3',
          quantity: 1,
          selections: [
            { groupId: 'g-empadas', optionProductIds: ['e1', 'e1', 'e2'] },
            { groupId: 'g-bebidas', optionProductIds: ['coca', 'coca'] },
            { groupId: 'g-inexistente', optionProductIds: ['e1'] },
          ],
        },
      ],
      context,
    );
    expect(result.issues[0]?.code).toBe('combo_group_missing');
  });

  it('multiplica o combo completo pela quantidade', () => {
    const result = priceCart(
      [
        {
          productId: 'combo3',
          quantity: 2,
          selections: [
            { groupId: 'g-empadas', optionProductIds: ['e1', 'e1', 'e2'] },
            { groupId: 'g-bebidas', optionProductIds: ['coca', 'coca'] },
          ],
        },
      ],
      context,
    );
    expect(result.subtotalCents).toBe(8980);
  });
});

describe('promoções', () => {
  const base: PricingProduct = {
    id: 'p',
    name: 'Empada em promoção',
    priceCents: 1190,
    promoPriceCents: 990,
    isAvailable: true,
    kind: 'simple',
  };

  it('usa o preço promocional quando não há janela definida', () => {
    expect(effectivePriceCents(base)).toBe(990);
  });

  it('ignora a promoção antes do início', () => {
    const product = { ...base, promoStartsAt: '2030-01-01T00:00:00Z' };
    expect(effectivePriceCents(product, new Date('2026-01-01T00:00:00Z'))).toBe(1190);
  });

  it('ignora a promoção depois do fim', () => {
    const product = { ...base, promoEndsAt: '2020-01-01T00:00:00Z' };
    expect(effectivePriceCents(product, new Date('2026-01-01T00:00:00Z'))).toBe(1190);
  });

  it('aplica a promoção dentro da janela', () => {
    const product = {
      ...base,
      promoStartsAt: '2026-01-01T00:00:00Z',
      promoEndsAt: '2026-12-31T23:59:59Z',
    };
    expect(effectivePriceCents(product, new Date('2026-06-01T12:00:00Z'))).toBe(990);
  });

  it('ignora preço promocional maior ou igual ao cheio', () => {
    expect(effectivePriceCents({ ...base, promoPriceCents: 1190 })).toBe(1190);
    expect(effectivePriceCents({ ...base, promoPriceCents: 1500 })).toBe(1190);
  });
});
