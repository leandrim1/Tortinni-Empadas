import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Flame, Sparkles, Truck, ChefHat, CupSoda } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { StoreInfoBar } from '@/components/layout/StoreInfoBar';
import { ProductCard } from '@/features/catalog/ProductCard';
import { ProductModal } from '@/features/catalog/ProductModal';
import { ProductGridSkeleton } from '@/components/ui/Skeleton';
import { useCart } from '@/features/cart/CartContext';
import { useAsync } from '@/hooks/useAsync';
import { fetchProducts } from '@/lib/api';
import { HERO_IMAGE } from '@/lib/catalog-data';
import type { Product, StorePayload } from '@/types/catalog';

interface HomePageProps {
  store: StorePayload | undefined;
}

export function HomePage({ store }: HomePageProps) {
  const { addItem, lastAdded } = useCart();
  const [selected, setSelected] = useState<Product | null>(null);
  const { data: products, loading } = useAsync(() => fetchProducts(), []);

  const empadas = (products ?? []).filter(
    (product) => product.kind === 'simple' && product.categorySlug?.startsWith('empadas'),
  );
  const combos = (products ?? []).filter((product) => product.kind === 'combo');
  const bebidas = (products ?? []).filter((product) => product.categorySlug === 'bebidas');

  return (
    <>
      {/* ───────────── Hero ───────────── */}
      <section className="dark-section relative overflow-hidden bg-night-950 pt-[68px] text-cream">
        <div className="absolute inset-0 oven-glow" aria-hidden="true" />
        <div
          className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-brand-700/20 blur-3xl"
          aria-hidden="true"
        />

        <div className="container-page relative grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-2 lg:gap-6">
          <div className="animate-fade-up">
            <span className="chip mb-5 bg-white/10 text-gold-300">
              <Flame size={14} aria-hidden="true" />
              Assadas na hora, todo dia
            </span>

            <h1 className="font-display text-[2.4rem] font-extrabold leading-[1.08] text-balance sm:text-5xl lg:text-[3.4rem]">
              Sua empada favorita,{' '}
              <span className="text-gold-300">quentinha até você</span>
            </h1>

            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-cream/70 text-pretty sm:text-base">
              Massa amanteigada, recheio generoso de frango e aquele cheiro de forno. Monte seu
              combo, escolha os sabores e receba rápido — ou retire na loja.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink to="/cardapio" size="lg" className="sm:w-auto">
                Ver cardápio
                <ArrowRight size={18} aria-hidden="true" />
              </ButtonLink>
              <ButtonLink
                to="/cardapio?categoria=combos"
                size="lg"
                variant="ghostDark"
                className="sm:w-auto"
              >
                Montar meu pedido
              </ButtonLink>
            </div>

            {store && (
              <div className="mt-9 border-t border-white/10 pt-6">
                <StoreInfoBar store={store} tone="dark" />
              </div>
            )}
          </div>

          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div
              className="absolute inset-0 scale-110 rounded-full bg-gold-400/15 blur-3xl"
              aria-hidden="true"
            />
            <picture>
              <source srcSet={HERO_IMAGE.webp} type="image/webp" />
              <img
                src={HERO_IMAGE.png}
                alt={HERO_IMAGE.alt}
                width={800}
                height={733}
                fetchPriority="high"
                decoding="async"
                className="relative w-full drop-shadow-2xl"
              />
            </picture>
          </div>
        </div>

        {/* Diferenciais */}
        <div className="relative border-t border-white/10 bg-night-900/60">
          <ul className="container-page grid gap-4 py-6 sm:grid-cols-3">
            {[
              { icon: ChefHat, title: 'Feitas à mão', text: 'Massa artesanal, assada no dia' },
              { icon: Truck, title: 'Entrega rápida', text: 'Chega quentinha na sua casa' },
              { icon: Sparkles, title: 'Combos que valem', text: 'Monte do seu jeito e economize' },
            ].map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-400/15 text-gold-300">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <span>
                  <strong className="block text-sm font-bold text-cream">{title}</strong>
                  <span className="text-xs text-cream/60">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────────── Ofertas principais ───────────── */}
      <Section
        id="ofertas"
        eyebrow="Ofertas principais"
        title="As mais pedidas da casa"
        description="Empada grande, recheio generoso e massa que desmancha."
        href="/cardapio"
      >
        {loading ? (
          <ProductGridSkeleton count={4} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {empadas.map((product, index) => (
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
        )}
      </Section>

      {/* ───────────── Combos ───────────── */}
      <section className="dark-section relative overflow-hidden bg-brand-950 py-16 text-cream">
        <div className="absolute inset-0 oven-glow opacity-60" aria-hidden="true" />
        <div className="container-page relative">
          <header className="mb-8 max-w-xl">
            <span className="chip mb-3 bg-white/10 text-gold-300">
              <Sparkles size={14} aria-hidden="true" />
              Combos
            </span>
            <h2 className="font-display text-3xl font-extrabold text-balance sm:text-4xl">
              Monte do seu jeito e economize
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-cream/70 text-pretty">
              Você escolhe os sabores das empadas e as bebidas. A gente assa, embala e manda.
            </p>
          </header>

          {loading ? (
            <ProductGridSkeleton count={2} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {combos.map((combo) => (
                <article
                  key={combo.id}
                  className="group flex gap-4 rounded-3xl bg-white/5 p-4 ring-1 ring-white/10
                             transition hover:bg-white/8 hover:ring-white/20 sm:p-5"
                >
                  <div className="h-28 w-28 shrink-0 self-center sm:h-32 sm:w-32">
                    <img
                      src={combo.cutoutUrl ?? combo.imageUrl ?? ''}
                      alt={combo.imageAlt ?? combo.name}
                      width={400}
                      height={400}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-contain transition duration-500 group-hover:scale-105"
                    />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <h3 className="font-display text-lg font-bold leading-snug text-cream">
                      {combo.name}
                    </h3>
                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-cream/65 text-pretty">
                      {combo.description}
                    </p>
                    {combo.serves && (
                      <span className="chip mt-2 w-fit bg-gold-400/15 text-gold-300">
                        Serve {combo.serves} pessoas
                      </span>
                    )}

                    <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                      <span className="font-display text-2xl font-extrabold text-gold-300">
                        {formatPrice(combo.currentPriceCents)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelected(combo)}
                        className="btn-primary btn-sm"
                      >
                        Montar combo
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ───────────── Bebidas ───────────── */}
      <Section
        id="bebidas"
        eyebrow="Bebidas"
        title="Para acompanhar"
        description="Geladas, do tamanho certo para o seu pedido."
        href="/cardapio?categoria=bebidas"
        icon={CupSoda}
      >
        {loading ? (
          <ProductGridSkeleton count={3} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {bebidas.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                justAdded={lastAdded === product.id}
                onSelect={setSelected}
                onQuickAdd={(item) => addItem(item)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* ───────────── Chamada final ───────────── */}
      <section className="container-page pb-4">
        <div className="relative overflow-hidden rounded-3xl bg-gold-400 px-6 py-10 text-night-950 sm:px-10 sm:py-12">
          <div className="relative max-w-lg">
            <h2 className="font-display text-2xl font-extrabold text-balance sm:text-3xl">
              Bateu a fome? A gente já tá com o forno ligado.
            </h2>
            <p className="mt-2 text-sm text-night-950/70">
              Peça pelo cardápio online e acompanhe seu pedido em tempo real.
            </p>
            <ButtonLink to="/cardapio" variant="secondary" size="lg" className="mt-6">
              Pedir agora
              <ArrowRight size={18} aria-hidden="true" />
            </ButtonLink>
          </div>
        </div>
      </section>

      <ProductModal product={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

interface SectionProps {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  icon?: typeof Flame;
  children: React.ReactNode;
}

function Section({ id, eyebrow, title, description, href, icon: Icon = Flame, children }: SectionProps) {
  return (
    <section id={id} className="container-page py-14 sm:py-16">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-lg">
          <span className="chip mb-2.5 bg-gold-100 text-gold-800">
            <Icon size={14} aria-hidden="true" />
            {eyebrow}
          </span>
          <h2 className="font-display text-3xl font-extrabold text-balance sm:text-4xl">{title}</h2>
          <p className="mt-2 text-[15px] text-night-900/60 text-pretty">{description}</p>
        </div>

        <Link
          to={href}
          className="group inline-flex items-center gap-1.5 text-sm font-bold text-brand-700 link-underline"
        >
          Ver tudo
          <ArrowRight size={15} className="transition group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </header>
      {children}
    </section>
  );
}
