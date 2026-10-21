import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db';
import { listCategories, listProducts, getProductBySlug, listFeatured } from '../../server/services/catalog';

let harness: TestDatabase;

beforeAll(async () => {
  harness = await createTestDatabase();
}, 120_000);

afterAll(async () => {
  await harness.close();
});

describe('catálogo carregado do banco', () => {
  it('traz as categorias do seed na ordem configurada', async () => {
    const categories = await listCategories();
    expect(categories.map((c) => c.slug)).toEqual([
      'ofertas-principais',
      'empadas-tradicionais',
      'empadas-especiais',
      'combos',
      'bebidas',
    ]);
  });

  it('cadastra as 4 empadas, as 3 bebidas e os 2 combos sem duplicar', async () => {
    const page = await listProducts({ pageSize: 100, includeUnavailable: true });
    const slugs = page.items.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(page.total).toBe(9);

    const empada = page.items.find((p) => p.slug === 'empada-frango-tradicional');
    expect(empada?.priceCents).toBe(1190);
    expect(page.items.filter((p) => p.kind === 'combo')).toHaveLength(2);
  });

  it('preserva o volume informado em cada bebida', async () => {
    const page = await listProducts({ categorySlug: 'bebidas', pageSize: 10 });
    const names = page.items.map((p) => p.name);
    expect(names).toContain('Coca-Cola 310 ml');
    expect(names).toContain('Guaraná Antarctica 350 ml');

    const coca = page.items.find((p) => p.slug === 'coca-cola-310ml');
    expect(coca?.description).toContain('310 ml');
    expect(coca?.description).not.toContain('350');
  });

  it('monta os grupos de escolha do combo de 3 empadas', async () => {
    const combo = await getProductBySlug('combo-3-empadas-2-refrigerantes');
    expect(combo.kind).toBe('combo');
    expect(combo.priceCents).toBe(4490);
    expect(combo.serves).toBe(3);

    const groups = combo.comboGroups ?? [];
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ minSelect: 3, maxSelect: 3 });
    expect(groups[1]).toMatchObject({ minSelect: 2, maxSelect: 2 });
    expect(groups[0]!.options).toHaveLength(4);
    expect(groups[1]!.options).toHaveLength(3);
  });

  it('destaca as empadas e os combos na home', async () => {
    const featured = await listFeatured();
    expect(featured.length).toBeGreaterThanOrEqual(4);
    expect(featured.every((p) => p.isFeatured)).toBe(true);
  });
});

describe('busca de produtos', () => {
  it('encontra por nome, ignorando acentos e caixa', async () => {
    const page = await listProducts({ search: 'GUARANA' });
    expect(page.items.map((p) => p.slug)).toContain('guarana-antarctica-350ml');
  });

  it('encontra por trecho da descrição', async () => {
    const page = await listProducts({ search: 'palmito' });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.slug).toBe('empada-frango-palmito');
  });

  it('encontra por categoria', async () => {
    const page = await listProducts({ search: 'bebidas' });
    expect(page.items.length).toBeGreaterThanOrEqual(3);
  });

  it('devolve lista vazia quando nada casa, sem quebrar', async () => {
    const page = await listProducts({ search: 'pizza de calabresa' });
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  it('não quebra com caracteres curinga do SQL', async () => {
    const page = await listProducts({ search: '%_' });
    expect(page.total).toBe(0);
  });
});
