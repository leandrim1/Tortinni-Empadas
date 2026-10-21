import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, X, ArrowLeft, SearchX, ShoppingBag, LogIn } from 'lucide-react';
import { ProductCard } from '@/features/catalog/ProductCard';
import { ProductModal } from '@/features/catalog/ProductModal';
import { ProductGridSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StoreInfoBar } from '@/components/layout/StoreInfoBar';
import { Logo } from '@/components/brand/Logo';
import { useCart } from '@/features/cart/CartContext';
import { useAsync } from '@/hooks/useAsync';
import { useDebounce } from '@/hooks/useDebounce';
import { fetchProducts, fetchCategories } from '@/lib/api';
import { formatBRL } from '@/utils/format';
import { HERO_IMAGE } from '@/lib/catalog-data';
import type { Product, StorePayload } from '@/types/catalog';

interface MenuPageProps {
  store: StorePayload | undefined;
}

export function MenuPage({ store }: MenuPageProps) {
  const [params, setParams] = useSearchParams();
  const { addItem, lastAdded, itemCount, priced, open } = useCart();

  const [searchInput, setSearchInput] = useState(params.get('busca') ?? '');
  const search = useDebounce(searchInput.trim(), 250);
  const activeCategory = params.get('categoria') ?? '';
  const [selected, setSelected] = useState<Product | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const { data: categories } = useAsync(() => fetchCategories(), []);
  const { data: products, loading } = useAsync(
    () => fetchProducts({ search: search || undefined }),
    [search],
  );

  // A busca na URL permite compartilhar o link do resultado.
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (search) next.set('busca', search);
    else next.delete('busca');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const grouped = useMemo(() => {
    const list = products ?? [];
    const visible = activeCategory
      ? list.filter((product) => product.categorySlug === activeCategory)
      : list;

    const buckets = new Map<string, { name: string; slug: string; items: Product[] }>();
    for (const product of visible) {
      const slug = product.categorySlug ?? 'outros';
      const bucket = buckets.get(slug) ?? {
        name: product.categoryName ?? 'Outros',
        slug,
        items: [],
      };
      bucket.items.push(product);
      buckets.set(slug, bucket);
    }

    const order = (categories ?? []).map((category) => category.slug);
    return [...buckets.values()].sort(
      (a, b) => indexOrLast(order, a.slug) - indexOrLast(order, b.slug),
    );
  }, [products, activeCategory, categories]);

  const total = grouped.reduce((sum, group) => sum + group.items.length, 0);

  function selectCategory(slug: string) {
    const next = new URLSearchParams(params);
    if (slug) next.set('categoria', slug);
    else next.delete('categoria');
    setParams(next);
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const availableCategories = useMemo(() => {
    const present = new Set((products ?? []).map((product) => product.categorySlug));
    return (categories ?? []).filter((category) => present.has(category.slug));
  }, [categories, products]);

  return (
    <>
      {/* ───────────── Banner + cartão da loja ───────────── */}
      <section className="dark-section relative overflow-hidden bg-night-950 pt-[68px]">
        <div className="absolute inset-0 oven-glow" aria-hidden="true" />
        <div
          className="absolute -right-20 -top-10 h-80 w-80 rounded-full bg-brand-700/25 blur-3xl"
          aria-hidden="true"
        />

        <div className="container-page relative flex h-44 items-center justify-between gap-6 sm:h-56">
          <div className="max-w-sm">
            <span className="chip mb-2 bg-white/10 text-gold-300">Cardápio completo</span>
            <h1 className="font-display text-2xl font-extrabold leading-tight text-cream text-balance sm:text-4xl">
              Escolha suas empadas
            </h1>
            <p className="mt-1.5 hidden text-sm text-cream/60 sm:block">
              Assadas na hora, do jeito que você gosta.
            </p>
          </div>

          <picture>
            <source srcSet={HERO_IMAGE.webp} type="image/webp" />
            <img
              src={HERO_IMAGE.png}
              alt={HERO_IMAGE.alt}
              width={800}
              height={733}
              fetchPriority="high"
              decoding="async"
              className="h-32 w-auto shrink-0 drop-shadow-2xl sm:h-48"
            />
          </picture>
        </div>
      </section>

      <div className="container-page -mt-7">
        <div className="card relative z-10 flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <Logo variant="dark" size="lg" />

            <div className="flex items-center gap-2">
              <Link to="/" className="btn-ghost btn-sm" aria-label="Voltar para a página inicial">
                <ArrowLeft size={15} aria-hidden="true" />
                <span className="hidden sm:inline">Início</span>
              </Link>
              <Link to="/conta" className="btn-secondary btn-sm">
                <LogIn size={15} aria-hidden="true" />
                Entrar
              </Link>
            </div>
          </div>

          {store && <StoreInfoBar store={store} />}

          {store?.store.announcement && (
            <p className="rounded-xl bg-gold-50 px-3 py-2.5 text-sm text-gold-900">
              {store.store.announcement}
            </p>
          )}
        </div>
      </div>

      {/* ───────────── Busca + categorias ───────────── */}
      <div className="sticky top-[68px] z-30 mt-5 border-b border-night-900/8 bg-cream/95 backdrop-blur-md">
        <div className="container-page py-3">
          <div className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-night-900/35"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Buscar empada, combo ou bebida…"
              aria-label="Buscar produtos"
              className="h-12 w-full rounded-full border border-night-900/10 bg-white pl-11 pr-11
                         text-[15px] shadow-sm placeholder:text-night-900/35 focus:border-gold-400"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                aria-label="Limpar busca"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5
                           text-night-900/40 transition hover:bg-night-900/5 hover:text-night-900"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <nav aria-label="Categorias" className="scroll-x mt-3">
            <button
              type="button"
              onClick={() => selectCategory('')}
              aria-current={!activeCategory ? 'true' : undefined}
              className={`chip shrink-0 border px-4 py-2 transition ${
                !activeCategory
                  ? 'border-transparent bg-brand-800 text-cream'
                  : 'border-night-900/12 bg-white text-night-900/70 hover:border-night-900/25'
              }`}
            >
              Tudo
            </button>
            {availableCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => selectCategory(category.slug)}
                aria-current={activeCategory === category.slug ? 'true' : undefined}
                className={`chip shrink-0 whitespace-nowrap border px-4 py-2 transition ${
                  activeCategory === category.slug
                    ? 'border-transparent bg-brand-800 text-cream'
                    : 'border-night-900/12 bg-white text-night-900/70 hover:border-night-900/25'
                }`}
              >
                {category.name}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ───────────── Resultados ───────────── */}
      <div ref={resultsRef} className="container-page pb-28 pt-6 sm:pb-16">
        {loading ? (
          <ProductGridSkeleton count={8} />
        ) : total === 0 ? (
          <EmptyState
            icon={SearchX}
            title="Nada encontrado por aqui"
            description={
              search
                ? `Não achamos nada para “${search}”. Tente outro termo ou veja o cardápio completo.`
                : 'Esta categoria ainda não tem produtos cadastrados.'
            }
            action={
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  selectCategory('');
                }}
                className="btn-primary btn-md"
              >
                Ver cardápio completo
              </button>
            }
          />
        ) : (
          <div className="space-y-10">
            {search && (
              <p className="text-sm text-night-900/60" aria-live="polite">
                <strong className="text-night-900">{total}</strong>{' '}
                {total === 1 ? 'resultado' : 'resultados'} para “{search}”
              </p>
            )}

            {grouped.map((group) => (
              <section key={group.slug} id={group.slug} aria-labelledby={`titulo-${group.slug}`}>
                <h2
                  id={`titulo-${group.slug}`}
                  className="mb-4 font-display text-2xl font-extrabold text-night-900"
                >
                  {group.name}
                  <span className="ml-2 text-sm font-semibold text-night-900/35">
                    {group.items.length}
                  </span>
                </h2>

                <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                  {group.items.map((product, index) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      priority={index < 2}
                      justAdded={lastAdded === product.id}
                      onSelect={setSelected}
                      onQuickAdd={(item) => addItem(item)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Barra flutuante do carrinho no celular */}
      {itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-night-900/10 bg-white/95 p-3 backdrop-blur-md safe-bottom sm:hidden">
          <button type="button" onClick={open} className="btn-primary btn-lg w-full justify-between">
            <span className="flex items-center gap-2">
              <ShoppingBag size={18} aria-hidden="true" />
              {itemCount} {itemCount === 1 ? 'item' : 'itens'}
            </span>
            <span className="tabular-nums">{formatBRL(priced.subtotalCents)}</span>
          </button>
        </div>
      )}

      <ProductModal product={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function indexOrLast(order: string[], slug: string): number {
  const index = order.indexOf(slug);
  return index === -1 ? 999 : index;
}
