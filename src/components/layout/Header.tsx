import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ShoppingBag, Menu, X, User } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { useCart } from '@/features/cart/CartContext';

const NAV = [
  { to: '/', label: 'Início', end: true },
  { to: '/cardapio', label: 'Cardápio' },
  { to: '/cardapio?categoria=combos', label: 'Combos' },
  { to: '/contato', label: 'Contato' },
];

export function Header() {
  const { itemCount, open } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // A home tem hero escuro: o header começa transparente e ganha fundo ao rolar.
  const overHero = location.pathname === '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setMobileOpen(false), [location.pathname, location.search]);

  const solid = scrolled || !overHero || mobileOpen;

  return (
    <header
      className={`dark-section fixed inset-x-0 top-0 z-40 transition-all duration-300 ${
        solid ? 'bg-night-950/95 shadow-lg backdrop-blur-md' : 'bg-transparent'
      }`}
      style={{ ['--header-height' as string]: '68px' }}
    >
      <div className="container-page flex h-[68px] items-center justify-between gap-4">
        <Link to="/" aria-label="Tortinni Empadas, página inicial">
          <Logo variant="light" size="md" />
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-full px-4 py-2 text-sm font-semibold transition ${
                  isActive && item.to === location.pathname + location.search
                    ? 'bg-white/10 text-gold-300'
                    : 'text-cream/80 hover:bg-white/5 hover:text-cream'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/conta"
            aria-label="Minha conta"
            className="hidden h-10 w-10 items-center justify-center rounded-full text-cream/80
                       transition hover:bg-white/10 hover:text-cream sm:flex"
          >
            <User size={19} />
          </Link>

          <Link
            to="/cardapio"
            className="btn-primary btn-sm hidden sm:inline-flex"
          >
            Pedir agora
          </Link>

          <button
            type="button"
            onClick={open}
            aria-label={`Abrir carrinho, ${itemCount} ${itemCount === 1 ? 'item' : 'itens'}`}
            className="relative flex h-10 w-10 items-center justify-center rounded-full
                       bg-white/10 text-cream transition hover:bg-white/20"
          >
            <ShoppingBag size={19} />
            {itemCount > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center
                           rounded-full bg-gold-400 px-1 text-[11px] font-extrabold text-night-950"
              >
                {itemCount > 99 ? '99+' : itemCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={mobileOpen}
            className="flex h-10 w-10 items-center justify-center rounded-full text-cream
                       transition hover:bg-white/10 md:hidden"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav
          aria-label="Menu móvel"
          className="border-t border-white/10 bg-night-950/98 px-4 pb-4 pt-2 md:hidden"
        >
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="block rounded-xl px-4 py-3 text-[15px] font-semibold text-cream/85 transition hover:bg-white/5"
            >
              {item.label}
            </NavLink>
          ))}
          <Link
            to="/conta"
            className="block rounded-xl px-4 py-3 text-[15px] font-semibold text-cream/85 transition hover:bg-white/5"
          >
            Minha conta
          </Link>
        </nav>
      )}
    </header>
  );
}
