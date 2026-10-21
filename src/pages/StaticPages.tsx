import { Link } from 'react-router-dom';
import { Instagram, MessageCircle, MapPin, Clock, Bike, Home, Lock, FileText } from 'lucide-react';
import type { StorePayload } from '@/types/catalog';
import { weekdayName, formatBRL, formatEta } from '@/utils/format';

interface PageProps {
  store: StorePayload | undefined;
}

function Shell({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <div className="container-page max-w-3xl pb-20 pt-[108px]">
      <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{title}</h1>
      {lead && <p className="mt-3 text-[15px] leading-relaxed text-night-900/65 text-pretty">{lead}</p>}
      <div className="mt-8 space-y-6">{children}</div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="mb-3 font-display text-xl font-bold">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-night-900/70 text-pretty">{children}</div>
    </section>
  );
}

export function ContactPage({ store }: PageProps) {
  const info = store?.store;
  return (
    <Shell title="Fale com a Tortinni" lead="Dúvidas sobre pedidos, encomendas ou entrega? Chame a gente.">
      <section className="card p-6">
        <ul className="space-y-4 text-sm">
          <li className="flex items-start gap-3">
            <Instagram size={18} className="mt-0.5 shrink-0 text-brand-700" aria-hidden="true" />
            <span>
              <strong className="block">Instagram</strong>
              <a
                href={info?.instagramUrl ?? 'https://www.instagram.com/tortinnisalgados'}
                target="_blank"
                rel="noreferrer noopener"
                className="text-brand-700 link-underline"
              >
                @tortinnisalgados
              </a>
            </span>
          </li>
          <li className="flex items-start gap-3">
            <MessageCircle size={18} className="mt-0.5 shrink-0 text-brand-700" aria-hidden="true" />
            <span>
              <strong className="block">WhatsApp</strong>
              {info?.whatsappNumber ? (
                <a href={`https://wa.me/55${info.whatsappNumber}`} className="text-brand-700 link-underline">
                  Abrir conversa
                </a>
              ) : (
                <span className="text-night-900/50">Número a cadastrar no painel da loja.</span>
              )}
            </span>
          </li>
          <li className="flex items-start gap-3">
            <MapPin size={18} className="mt-0.5 shrink-0 text-brand-700" aria-hidden="true" />
            <span>
              <strong className="block">Endereço</strong>
              {info?.addressLine ?? (
                <span className="text-night-900/50">Endereço a cadastrar no painel da loja.</span>
              )}
            </span>
          </li>
        </ul>
      </section>

      <Block title="Horário de funcionamento">
        <ul className="divide-y divide-night-900/8">
          {(store?.hours ?? []).map((hour) => (
            <li key={hour.weekday} className="flex justify-between py-2 tabular-nums">
              <span>{weekdayName(hour.weekday)}</span>
              <span className={hour.isClosed ? 'text-night-900/40' : 'font-semibold'}>
                {hour.isClosed ? 'Fechado' : `${hour.opensAt} – ${hour.closesAt}`}
              </span>
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-2 pt-2 text-xs text-night-900/50">
          <Clock size={14} aria-hidden="true" />
          Horários configuráveis no painel administrativo.
        </p>
      </Block>
    </Shell>
  );
}

export function DeliveryPage({ store }: PageProps) {
  const info = store?.store;
  return (
    <Shell
      title="Entrega e retirada"
      lead="Levamos sua empada quentinha ou você retira na loja — o que for melhor para você."
    >
      <Block title="Como funciona">
        <p className="flex items-start gap-2">
          <Bike size={16} className="mt-0.5 shrink-0 text-brand-700" aria-hidden="true" />
          <span>
            <strong>Entrega:</strong> tempo estimado de{' '}
            {info ? formatEta(info.etaMinMinutes, info.etaMaxMinutes) : '30–50 min'}, contado a
            partir da confirmação do pedido.
          </span>
        </p>
        <p className="flex items-start gap-2">
          <Home size={16} className="mt-0.5 shrink-0 text-brand-700" aria-hidden="true" />
          <span>
            <strong>Retirada:</strong> sem taxa. Avisamos quando o pedido estiver pronto.
          </span>
        </p>
      </Block>

      <Block title="Taxa de entrega">
        {(store?.regions.length ?? 0) > 0 ? (
          <ul className="divide-y divide-night-900/8">
            {store!.regions.map((region) => (
              <li key={region.id} className="flex justify-between py-2">
                <span>{region.name}</span>
                <span className="font-semibold tabular-nums">{formatBRL(region.feeCents)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            As regiões atendidas e suas taxas são cadastradas pela loja no painel administrativo.
            Enquanto nenhum bairro estiver cadastrado, a taxa é confirmada no contato — nenhum valor
            é cobrado sem combinação prévia.
          </p>
        )}
        <p>
          Pedido mínimo: <strong>{formatBRL(info?.minOrderCents ?? 2000)}</strong>.
        </p>
      </Block>
    </Shell>
  );
}

export function PrivacyPage() {
  return (
    <Shell
      title="Política de privacidade"
      lead="Tratamos seus dados conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018)."
    >
      <Block title="Quais dados coletamos">
        <p>
          Para processar um pedido, coletamos nome, telefone, endereço de entrega e, quando
          informado, e-mail. Esses dados são usados exclusivamente para preparar, entregar e dar
          suporte ao seu pedido.
        </p>
      </Block>
      <Block title="Pagamentos">
        <p className="flex items-start gap-2">
          <Lock size={16} className="mt-0.5 shrink-0 text-brand-700" aria-hidden="true" />
          <span>
            Nunca armazenamos dados de cartão. Pagamentos online são processados por provedor
            especializado; guardamos apenas o identificador da transação e o status confirmado.
          </span>
        </p>
      </Block>
      <Block title="Seus direitos">
        <p>
          Você pode solicitar acesso, correção ou exclusão dos seus dados a qualquer momento pelos
          canais de atendimento. Pedidos já entregues podem ser mantidos pelo prazo legal de
          guarda fiscal.
        </p>
      </Block>
      <Block title="Cookies">
        <p>
          Usamos cookies estritamente necessários para manter sua sessão e o carrinho. Não há
          cookies de publicidade ou rastreamento de terceiros.
        </p>
      </Block>
    </Shell>
  );
}

export function TermsPage() {
  return (
    <Shell title="Termos de uso" lead="Regras simples para que tudo corra bem entre você e a Tortinni.">
      <Block title="Pedidos">
        <p className="flex items-start gap-2">
          <FileText size={16} className="mt-0.5 shrink-0 text-brand-700" aria-hidden="true" />
          <span>
            Os preços exibidos no cardápio são os praticados no momento do pedido e recalculados no
            servidor antes da confirmação. O pedido mínimo e a taxa de entrega aparecem no checkout
            antes de qualquer cobrança.
          </span>
        </p>
      </Block>
      <Block title="Cancelamento">
        <p>
          Pedidos podem ser cancelados enquanto não entrarem em preparação. Depois disso, fale com a
          loja pelos canais de atendimento.
        </p>
      </Block>
      <Block title="Disponibilidade">
        <p>
          Itens podem ficar indisponíveis ao longo do dia. Quando isso acontece, o produto aparece
          marcado como indisponível e não pode ser adicionado ao carrinho.
        </p>
      </Block>
    </Shell>
  );
}

export function AccountPage() {
  return (
    <Shell
      title="Minha conta"
      lead="Entre para acompanhar seus pedidos, salvar endereços e repetir o pedido favorito em um toque."
    >
      <section className="card p-6">
        <p className="text-sm leading-relaxed text-night-900/70 text-pretty">
          Cadastro, login, recuperação de senha e histórico de pedidos já estão implementados no
          backend, com senha protegida por hash e sessão em cookie seguro. Esta tela é ativada
          junto com o banco de dados.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link to="/cardapio" className="btn-primary btn-md flex-1">
            Continuar sem conta
          </Link>
          <Link to="/contato" className="btn-ghost btn-md flex-1">
            Falar com a loja
          </Link>
        </div>
      </section>
    </Shell>
  );
}
