import { useLocation, Link } from 'react-router-dom';
import { CheckCircle2, Clock, ChefHat, Bike, PackageCheck, Info } from 'lucide-react';
import { formatBRL } from '@/utils/format';

const STEPS = [
  { key: 'received', label: 'Recebido', icon: CheckCircle2, hint: 'A loja recebeu seu pedido' },
  { key: 'confirmed', label: 'Confirmado', icon: Clock, hint: 'Pagamento e dados conferidos' },
  { key: 'preparing', label: 'Em preparação', icon: ChefHat, hint: 'Suas empadas estão no forno' },
  { key: 'out_for_delivery', label: 'Saiu para entrega', icon: Bike, hint: 'A caminho do seu endereço' },
  { key: 'delivered', label: 'Entregue', icon: PackageCheck, hint: 'Bom apetite!' },
] as const;

interface PreviewState {
  preview?: boolean;
  fulfillment?: 'delivery' | 'pickup';
  payment?: string;
  customer?: { name: string; phone: string };
  totalCents?: number;
}

/**
 * Acompanhamento do pedido. Com a API ligada, esta tela lê
 * `GET /api/orders/track?code=…&token=…`; aqui ela mostra a prévia do fluxo.
 */
export function OrderStatusPage() {
  const location = useLocation();
  const state = (location.state ?? {}) as PreviewState;
  const currentIndex = 0;

  const steps = STEPS.filter((step) =>
    state.fulfillment === 'pickup' ? step.key !== 'out_for_delivery' : true,
  );

  return (
    <div className="container-page max-w-2xl pb-20 pt-[100px]">
      <div className="card overflow-hidden">
        <div className="dark-section bg-brand-900 px-6 py-8 text-center text-cream">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gold-400 text-night-950">
            <CheckCircle2 size={28} aria-hidden="true" />
          </span>
          <h1 className="font-display text-2xl font-extrabold">Pedido confirmado!</h1>
          <p className="mt-1.5 text-sm text-cream/70">
            {state.customer?.name
              ? `Obrigado, ${state.customer.name.split(' ')[0]}. `
              : 'Obrigado. '}
            Já avisamos a cozinha.
          </p>

          <dl className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm">
            <div>
              <dt className="text-cream/55">Número do pedido</dt>
              <dd className="font-display text-lg font-bold tracking-wider text-gold-300">
                TRT-PREVIA
              </dd>
            </div>
            {state.totalCents != null && (
              <div>
                <dt className="text-cream/55">Total</dt>
                <dd className="font-display text-lg font-bold">{formatBRL(state.totalCents)}</dd>
              </div>
            )}
          </dl>
        </div>

        <ol className="space-y-0 p-6">
          {steps.map((step, index) => {
            const done = index <= currentIndex;
            const Icon = step.icon;
            return (
              <li key={step.key} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
                      done ? 'bg-gold-400 text-night-950' : 'bg-night-900/6 text-night-900/35'
                    }`}
                  >
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  {index < steps.length - 1 && (
                    <span
                      className={`my-1 w-0.5 flex-1 rounded-full ${
                        index < currentIndex ? 'bg-gold-400' : 'bg-night-900/8'
                      }`}
                      style={{ minHeight: 28 }}
                      aria-hidden="true"
                    />
                  )}
                </div>

                <div className={`pb-6 ${done ? '' : 'opacity-50'}`}>
                  <p className="font-display text-[15px] font-bold text-night-900">{step.label}</p>
                  <p className="text-sm text-night-900/55">{step.hint}</p>
                  {index === currentIndex && (
                    <span className="chip mt-1.5 bg-brand-100 text-brand-800">Agora</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="border-t border-night-900/8 bg-white px-6 py-5">
          <p className="flex items-start gap-2 text-xs text-night-900/60">
            <Info size={15} className="mt-px shrink-0 text-brand-700" aria-hidden="true" />
            Esta é a prévia da tela de acompanhamento. Com o banco conectado, o status é atualizado
            pela loja no painel e aparece aqui em tempo real, com link seguro por pedido.
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link to="/cardapio" className="btn-primary btn-md flex-1">
              Fazer outro pedido
            </Link>
            <Link to="/" className="btn-ghost btn-md flex-1">
              Voltar ao início
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
