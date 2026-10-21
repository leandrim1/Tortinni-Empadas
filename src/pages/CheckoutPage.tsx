import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bike,
  Store,
  CreditCard,
  Banknote,
  QrCode,
  AlertTriangle,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductImage } from '@/components/ui/ProductImage';
import { useCart } from '@/features/cart/CartContext';
import { formatBRL, formatPhone } from '@/utils/format';
import type { StorePayload } from '@/types/catalog';
import { ShoppingBag } from 'lucide-react';

interface CheckoutPageProps {
  store: StorePayload | undefined;
}

type Fulfillment = 'delivery' | 'pickup';
type PaymentMethod = 'pix' | 'cash' | 'card_on_delivery';

const PAYMENT_LABELS: Record<PaymentMethod, { label: string; icon: typeof QrCode; hint?: string }> = {
  pix: { label: 'Pix', icon: QrCode, hint: 'Chave enviada após a confirmação' },
  cash: { label: 'Dinheiro', icon: Banknote, hint: 'Informe se precisa de troco' },
  card_on_delivery: { label: 'Cartão na entrega', icon: CreditCard, hint: 'Maquininha no local' },
};

export function CheckoutPage({ store }: CheckoutPageProps) {
  const navigate = useNavigate();
  const { lines, priced, productFor, clear } = useCart();

  const [fulfillment, setFulfillment] = useState<Fulfillment>('delivery');
  const [payment, setPayment] = useState<PaymentMethod>('pix');
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    reference: '',
    notes: '',
    changeFor: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const regions = store?.regions ?? [];
  const availablePayments = (store?.paymentMethods ?? [])
    .filter((method) => method.enabled && method.method in PAYMENT_LABELS)
    .map((method) => method.method as PaymentMethod);

  const deliveryFeeCents = 0;
  const totalCents = priced.subtotalCents + (fulfillment === 'delivery' ? deliveryFeeCents : 0);

  const errors = useMemo(() => {
    const found: Record<string, string> = {};
    if (!submitted) return found;
    if (form.name.trim().length < 2) found.name = 'Informe seu nome completo.';
    if (form.phone.replace(/\D/g, '').length < 10) found.phone = 'Informe um telefone com DDD.';
    if (fulfillment === 'delivery') {
      if (form.street.trim().length < 3) found.street = 'Informe a rua.';
      if (!form.number.trim()) found.number = 'Informe o número.';
      if (form.neighborhood.trim().length < 2) found.neighborhood = 'Informe o bairro.';
      if (form.city.trim().length < 2) found.city = 'Informe a cidade.';
    }
    return found;
  }, [submitted, form, fulfillment]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);

    const hasErrors = Object.keys(validate()).length > 0;
    if (hasErrors || !priced.meetsMinimum) return;

    // Na vitrine de aprovação o pedido não é persistido: a confirmação é só
    // a prévia da tela. Com a API ligada, aqui entra POST /api/orders.
    navigate('/pedido/previa', {
      state: {
        preview: true,
        fulfillment,
        payment,
        customer: { name: form.name, phone: form.phone },
        totalCents,
      },
    });
    clear();
  }

  function validate(): Record<string, string> {
    const found: Record<string, string> = {};
    if (form.name.trim().length < 2) found.name = 'Informe seu nome completo.';
    if (form.phone.replace(/\D/g, '').length < 10) found.phone = 'Informe um telefone com DDD.';
    if (fulfillment === 'delivery') {
      if (form.street.trim().length < 3) found.street = 'Informe a rua.';
      if (!form.number.trim()) found.number = 'Informe o número.';
      if (form.neighborhood.trim().length < 2) found.neighborhood = 'Informe o bairro.';
      if (form.city.trim().length < 2) found.city = 'Informe a cidade.';
    }
    return found;
  }

  if (lines.length === 0) {
    return (
      <div className="container-page min-h-[60vh] pt-[108px]">
        <EmptyState
          icon={ShoppingBag}
          title="Seu carrinho está vazio"
          description="Escolha suas empadas no cardápio para finalizar o pedido."
          action={
            <Link to="/cardapio" className="btn-primary btn-md">
              Ver cardápio
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-page pb-16 pt-[92px]">
      <Link
        to="/cardapio"
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 link-underline"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        Voltar ao cardápio
      </Link>

      <h1 className="mb-6 font-display text-3xl font-extrabold sm:text-4xl">Finalizar pedido</h1>

      <form onSubmit={handleSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {/* Entrega ou retirada */}
          <fieldset className="card p-5">
            <legend className="mb-3 font-display text-lg font-bold">Como você quer receber?</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <OptionTile
                active={fulfillment === 'delivery'}
                onClick={() => setFulfillment('delivery')}
                icon={Bike}
                title="Entrega"
                subtitle="Levamos até você"
                disabled={!store?.store.deliveryEnabled}
              />
              <OptionTile
                active={fulfillment === 'pickup'}
                onClick={() => setFulfillment('pickup')}
                icon={Store}
                title="Retirar na loja"
                subtitle="Sem taxa de entrega"
                disabled={!store?.store.pickupEnabled}
              />
            </div>
          </fieldset>

          {/* Dados do cliente */}
          <fieldset className="card space-y-4 p-5">
            <legend className="mb-1 font-display text-lg font-bold">Seus dados</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Nome completo"
                value={form.name}
                onChange={(value) => set('name', value)}
                error={errors.name}
                autoComplete="name"
                required
              />
              <Field
                label="Telefone / WhatsApp"
                value={form.phone}
                onChange={(value) => set('phone', formatPhone(value))}
                error={errors.phone}
                inputMode="tel"
                autoComplete="tel"
                placeholder="(11) 99999-9999"
                required
              />
            </div>
            <Field
              label="E-mail"
              optional
              type="email"
              value={form.email}
              onChange={(value) => set('email', value)}
              autoComplete="email"
              placeholder="para receber a confirmação"
            />
          </fieldset>

          {/* Endereço */}
          {fulfillment === 'delivery' && (
            <fieldset className="card space-y-4 p-5">
              <legend className="mb-1 font-display text-lg font-bold">Endereço de entrega</legend>

              <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                <Field
                  label="Rua"
                  value={form.street}
                  onChange={(value) => set('street', value)}
                  error={errors.street}
                  autoComplete="address-line1"
                  required
                />
                <Field
                  label="Número"
                  value={form.number}
                  onChange={(value) => set('number', value)}
                  error={errors.number}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Complemento"
                  optional
                  value={form.complement}
                  onChange={(value) => set('complement', value)}
                  placeholder="Apto, bloco…"
                />
                {regions.length > 0 ? (
                  <SelectField
                    label="Bairro"
                    value={form.neighborhood}
                    onChange={(value) => set('neighborhood', value)}
                    error={errors.neighborhood}
                    options={regions.map((region) => ({
                      value: region.name,
                      label: `${region.name} · ${formatBRL(region.feeCents)}`,
                    }))}
                  />
                ) : (
                  <Field
                    label="Bairro"
                    value={form.neighborhood}
                    onChange={(value) => set('neighborhood', value)}
                    error={errors.neighborhood}
                    autoComplete="address-level3"
                    required
                  />
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Cidade"
                  value={form.city}
                  onChange={(value) => set('city', value)}
                  error={errors.city}
                  autoComplete="address-level2"
                  required
                />
                <Field
                  label="Ponto de referência"
                  optional
                  value={form.reference}
                  onChange={(value) => set('reference', value)}
                  placeholder="Portão verde, ao lado da padaria…"
                />
              </div>

              {regions.length === 0 && (
                <p className="flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-xs text-brand-900">
                  <Info size={15} className="mt-px shrink-0" aria-hidden="true" />
                  As taxas por bairro são cadastradas no painel da loja. Enquanto isso, a entrega é
                  confirmada no contato.
                </p>
              )}
            </fieldset>
          )}

          {/* Pagamento */}
          <fieldset className="card p-5">
            <legend className="mb-3 font-display text-lg font-bold">Forma de pagamento</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {availablePayments.map((method) => {
                const config = PAYMENT_LABELS[method];
                return (
                  <OptionTile
                    key={method}
                    active={payment === method}
                    onClick={() => setPayment(method)}
                    icon={config.icon}
                    title={config.label}
                    subtitle={config.hint}
                  />
                );
              })}
            </div>

            {payment === 'cash' && (
              <div className="mt-4 max-w-xs">
                <Field
                  label="Troco para"
                  optional
                  value={form.changeFor}
                  onChange={(value) => set('changeFor', value)}
                  inputMode="decimal"
                  placeholder="R$ 50,00"
                />
              </div>
            )}

            {payment === 'pix' && !store?.integrations.onlinePayment && (
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-gold-50 px-3 py-2.5 text-xs text-gold-900">
                <Info size={15} className="mt-px shrink-0" aria-hidden="true" />
                Pix automático ainda não configurado: após confirmar, a loja envia a chave pelo
                WhatsApp. O pedido só é marcado como pago depois da confirmação real.
              </p>
            )}
          </fieldset>

          {/* Observações */}
          <fieldset className="card p-5">
            <legend className="mb-2 font-display text-lg font-bold">Observações do pedido</legend>
            <textarea
              value={form.notes}
              onChange={(event) => set('notes', event.target.value.slice(0, 500))}
              rows={3}
              placeholder="Alguma instrução para a cozinha ou para a entrega?"
              className="w-full resize-none rounded-xl border border-night-900/12 bg-white px-3 py-2.5
                         text-sm placeholder:text-night-900/30 focus:border-gold-400"
            />
          </fieldset>
        </div>

        {/* Resumo */}
        <aside className="lg:sticky lg:top-[88px] lg:h-fit">
          <div className="card overflow-hidden">
            <h2 className="border-b border-night-900/8 px-5 py-4 font-display text-lg font-bold">
              Resumo do pedido
            </h2>

            <ul className="max-h-72 divide-y divide-night-900/8 overflow-y-auto">
              {lines.map((line, index) => {
                const product = productFor(line.productId);
                const item = priced.items[index];
                if (!product) return null;
                return (
                  <li key={line.lineId} className="flex gap-3 px-5 py-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gold-50">
                      <ProductImage
                        src={product.imageUrl}
                        alt={product.imageAlt}
                        name={product.name}
                        sizes="48px"
                        className="h-full w-full object-contain p-1"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug">
                        <span className="text-night-900/50">{line.quantity}×</span> {product.name}
                      </p>
                      {line.selections.map((selection) => (
                        <p key={selection.groupId} className="text-xs text-night-900/55">
                          {selection.optionProductIds
                            .map((id) => productFor(id)?.name ?? '')
                            .filter(Boolean)
                            .join(', ')}
                        </p>
                      ))}
                    </div>
                    <span className="text-sm font-bold tabular-nums">
                      {formatBRL(item?.totalCents ?? 0)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <dl className="space-y-2 border-t border-night-900/8 px-5 py-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-night-900/60">Subtotal</dt>
                <dd className="font-semibold tabular-nums">{formatBRL(priced.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-night-900/60">Entrega</dt>
                <dd className="tabular-nums">
                  {fulfillment === 'pickup' ? (
                    <span className="font-semibold text-brand-700">Grátis</span>
                  ) : (
                    <span className="text-night-900/50">A confirmar</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between border-t border-night-900/8 pt-2">
                <dt className="font-display text-base font-bold">Total</dt>
                <dd className="font-display text-xl font-extrabold tabular-nums text-brand-800">
                  {formatBRL(totalCents)}
                </dd>
              </div>
            </dl>

            {!priced.meetsMinimum && (
              <p className="mx-5 mb-4 flex items-start gap-2 rounded-xl bg-gold-50 px-3 py-2.5 text-xs text-gold-900">
                <AlertTriangle size={15} className="mt-px shrink-0" aria-hidden="true" />
                <span>
                  Pedido mínimo de <strong>{formatBRL(priced.minOrderCents)}</strong>. Faltam{' '}
                  <strong>{formatBRL(priced.missingForMinimumCents)}</strong>.
                </span>
              </p>
            )}

            <div className="px-5 pb-5">
              <Button type="submit" size="lg" fullWidth disabled={!priced.meetsMinimum}>
                Confirmar pedido
              </Button>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-night-900/45">
                <ShieldCheck size={13} aria-hidden="true" />
                Os valores são recalculados no servidor antes da cobrança.
              </p>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}

interface OptionTileProps {
  active: boolean;
  onClick: () => void;
  icon: typeof Bike;
  title: string;
  subtitle?: string;
  disabled?: boolean;
}

function OptionTile({ active, onClick, icon: Icon, title, subtitle, disabled }: OptionTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left transition
                  disabled:cursor-not-allowed disabled:opacity-40 ${
                    active
                      ? 'border-gold-400 bg-gold-50 ring-1 ring-gold-400'
                      : 'border-night-900/12 bg-white hover:border-night-900/25'
                  }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          active ? 'bg-gold-400 text-night-950' : 'bg-night-900/5 text-night-900/50'
        }`}
      >
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-night-900">{title}</span>
        {subtitle && <span className="block text-xs text-night-900/55">{subtitle}</span>}
      </span>
    </button>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  optional?: boolean;
  required?: boolean;
  placeholder?: string;
  inputMode?: 'text' | 'tel' | 'email' | 'decimal';
  autoComplete?: string;
}

function Field({
  label,
  value,
  onChange,
  error,
  type = 'text',
  optional,
  required,
  placeholder,
  inputMode,
  autoComplete,
}: FieldProps) {
  const id = `campo-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-night-900">
        {label}
        {optional && <span className="ml-1 font-normal text-night-900/45">(opcional)</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-erro` : undefined}
        className={`h-11 w-full rounded-xl border bg-white px-3 text-sm placeholder:text-night-900/30
                    ${error ? 'border-crust' : 'border-night-900/12 focus:border-gold-400'}`}
      />
      {error && (
        <p id={`${id}-erro`} className="mt-1 text-xs font-medium text-crust">
          {error}
        </p>
      )}
    </div>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  error?: string;
}

function SelectField({ label, value, onChange, options, error }: SelectFieldProps) {
  const id = `campo-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-night-900">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? 'true' : undefined}
        className={`h-11 w-full rounded-xl border bg-white px-3 text-sm
                    ${error ? 'border-crust' : 'border-night-900/12 focus:border-gold-400'}`}
      >
        <option value="">Selecione o bairro</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs font-medium text-crust">{error}</p>}
    </div>
  );
}
