import { Link } from 'react-router-dom';
import { Instagram, MessageCircle, MapPin, Clock } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import type { StorePayload } from '@/types/catalog';
import { weekdayName } from '@/utils/format';

interface FooterProps {
  store?: StorePayload;
}

export function Footer({ store }: FooterProps) {
  const info = store?.store;
  const hours = store?.hours ?? [];
  const year = new Date().getFullYear();

  return (
    <footer className="dark-section mt-16 bg-night-950 text-cream/70">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <Logo variant="light" size="md" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-pretty">
            {info?.tagline ?? 'Empadas artesanais assadas na hora'}. Massa amanteigada, recheio
            generoso e entrega rápida.
          </p>
          {info?.instagramUrl && (
            <a
              href={info.instagramUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2
                         text-sm font-semibold text-cream transition hover:bg-white/20"
            >
              <Instagram size={16} aria-hidden="true" />
              @tortinnisalgados
            </a>
          )}
        </div>

        <nav aria-label="Navegação do rodapé">
          <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-gold-300">
            Navegação
          </h2>
          <ul className="space-y-2 text-sm">
            <li><Link to="/" className="transition hover:text-cream">Início</Link></li>
            <li><Link to="/cardapio" className="transition hover:text-cream">Cardápio</Link></li>
            <li><Link to="/cardapio?categoria=combos" className="transition hover:text-cream">Combos</Link></li>
            <li><Link to="/pedido" className="transition hover:text-cream">Acompanhar pedido</Link></li>
            <li><Link to="/contato" className="transition hover:text-cream">Contato</Link></li>
          </ul>
        </nav>

        <div>
          <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-gold-300">
            Atendimento
          </h2>
          <ul className="space-y-2.5 text-sm">
            {info?.whatsappNumber ? (
              <li>
                <a
                  href={`https://wa.me/55${info.whatsappNumber}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 transition hover:text-cream"
                >
                  <MessageCircle size={15} aria-hidden="true" />
                  WhatsApp
                </a>
              </li>
            ) : (
              <li className="flex items-center gap-2 text-cream/45">
                <MessageCircle size={15} aria-hidden="true" />
                WhatsApp a cadastrar
              </li>
            )}

            {info?.addressLine ? (
              <li className="flex items-start gap-2">
                <MapPin size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                {info.addressLine}
              </li>
            ) : (
              <li className="flex items-center gap-2 text-cream/45">
                <MapPin size={15} aria-hidden="true" />
                Endereço a cadastrar
              </li>
            )}
          </ul>
        </div>

        <div>
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-gold-300">
            <Clock size={14} aria-hidden="true" />
            Horários
          </h2>
          <ul className="space-y-1 text-sm tabular-nums">
            {hours.map((hour) => (
              <li key={hour.weekday} className="flex justify-between gap-4">
                <span>{weekdayName(hour.weekday)}</span>
                <span className={hour.isClosed ? 'text-cream/40' : ''}>
                  {hour.isClosed ? 'Fechado' : `${hour.opensAt}–${hour.closesAt}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-3 py-5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Tortinni Empadas. Todos os direitos reservados.</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            <li><Link to="/politica-de-privacidade" className="transition hover:text-cream">Política de privacidade</Link></li>
            <li><Link to="/termos-de-uso" className="transition hover:text-cream">Termos de uso</Link></li>
            <li><Link to="/entrega" className="transition hover:text-cream">Entrega</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
