import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { CartProvider } from '@/features/cart/CartContext';
import { CartDrawer } from '@/features/cart/CartDrawer';
import { HomePage } from '@/pages/HomePage';
import { useAsync } from '@/hooks/useAsync';
import { fetchStore, fetchProducts } from '@/lib/api';

// Divisão por rota: a home carrega sozinha, o resto sob demanda.
const MenuPage = lazy(() => import('@/pages/MenuPage').then((m) => ({ default: m.MenuPage })));
const CheckoutPage = lazy(() =>
  import('@/pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage })),
);
const OrderStatusPage = lazy(() =>
  import('@/pages/OrderStatusPage').then((m) => ({ default: m.OrderStatusPage })),
);
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);
const ContactPage = lazy(() => import('@/pages/StaticPages').then((m) => ({ default: m.ContactPage })));
const DeliveryPage = lazy(() => import('@/pages/StaticPages').then((m) => ({ default: m.DeliveryPage })));
const PrivacyPage = lazy(() => import('@/pages/StaticPages').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('@/pages/StaticPages').then((m) => ({ default: m.TermsPage })));
const AccountPage = lazy(() => import('@/pages/StaticPages').then((m) => ({ default: m.AccountPage })));

export default function App() {
  const { data: store } = useAsync(() => fetchStore(), []);
  const { data: catalog } = useAsync(() => fetchProducts(), []);

  return (
    <CartProvider catalog={catalog ?? []}>
      <ScrollToTop />
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50
                   focus:rounded-full focus:bg-gold-400 focus:px-5 focus:py-2.5 focus:font-semibold"
      >
        Pular para o conteúdo
      </a>

      <Header />

      <main id="conteudo">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage store={store} />} />
            <Route path="/cardapio" element={<MenuPage store={store} />} />
            <Route path="/checkout" element={<CheckoutPage store={store} />} />
            <Route path="/pedido" element={<OrderStatusPage />} />
            <Route path="/pedido/:code" element={<OrderStatusPage />} />
            <Route path="/conta" element={<AccountPage />} />
            <Route path="/contato" element={<ContactPage store={store} />} />
            <Route path="/entrega" element={<DeliveryPage store={store} />} />
            <Route path="/politica-de-privacidade" element={<PrivacyPage />} />
            <Route path="/termos-de-uso" element={<TermsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>

      <Footer store={store} />
      <CartDrawer />
    </CartProvider>
  );
}

function RouteFallback() {
  return (
    <div className="container-page flex min-h-[60vh] items-center justify-center pt-[68px]">
      <span className="sr-only">Carregando…</span>
      <span
        className="h-8 w-8 animate-spin rounded-full border-2 border-night-900/15 border-t-gold-500"
        aria-hidden="true"
      />
    </div>
  );
}

/** Troca de rota volta ao topo — exceto quando a URL só muda filtros do cardápio. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}
