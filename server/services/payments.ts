import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, desc, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { orders, paymentTransactions, orderStatusHistory, webhookEvents } from '../../db/schema';
import { env } from '../lib/env';
import { badRequest, notFound, serviceUnavailable, unauthorized } from '../lib/errors';
import { logger } from '../lib/logger';
import { centsToDecimalString } from '../../shared/money';

/**
 * Integração Pix com a ValidaPay.
 *
 * Nada aqui marca um pedido como pago por conta própria: o status só muda
 * quando chega um webhook `payment.success` com assinatura válida E valor
 * conferido contra o total do pedido.
 */

const PROVIDER = 'validapay';
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

interface TokenCache {
  token: string;
  expiresAt: number;
}
let tokenCache: TokenCache | undefined;

export function isOnlinePaymentConfigured(): boolean {
  return env.onlinePaymentConfigured;
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;
  if (!env.paymentClientId || !env.paymentClientSecret) {
    throw serviceUnavailable('Credenciais de pagamento não configuradas.');
  }

  const basic = Buffer.from(`${env.paymentClientId}:${env.paymentClientSecret}`).toString('base64');
  const response = await fetch(`${env.paymentApiBaseUrl}/v1/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'charges/write charges/read' }),
  });

  if (!response.ok) {
    logger.error('Falha ao obter token do provedor de pagamento', { status: response.status });
    throw serviceUnavailable('Não foi possível autenticar no provedor de pagamento.');
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw serviceUnavailable('Resposta inválida do provedor de pagamento.');

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return tokenCache.token;
}

export interface PixCharge {
  chargeId: string;
  /** Código copia e cola. */
  emv: string;
  /** Data URL PNG já pronta para exibir. */
  qrCode: string;
  amountCents: number;
  status: 'awaiting_payment';
}

/**
 * Cria (ou reaproveita) a cobrança Pix de um pedido.
 *
 * `POST /v1/charges/pix` NÃO é idempotente: duas chamadas iguais criam duas
 * cobranças. Por isso guardamos o índice pedido → cobrança e devolvemos a
 * cobrança existente em vez de abrir outra.
 */
export async function createPixChargeForOrder(orderId: string): Promise<PixCharge> {
  if (!isOnlinePaymentConfigured()) {
    throw serviceUnavailable(
      'Pagamento online pendente de configuração. Combine o Pix diretamente com a loja.',
    );
  }

  const db = getDb();
  const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const order = orderRows[0];
  if (!order) throw notFound('Pedido não encontrado.');
  if (order.paymentStatus === 'paid') throw badRequest('Este pedido já está pago.');
  if (order.status === 'cancelled') throw badRequest('Este pedido foi cancelado.');

  const existing = await db
    .select()
    .from(paymentTransactions)
    .where(
      and(
        eq(paymentTransactions.orderId, orderId),
        eq(paymentTransactions.provider, PROVIDER),
        inArray(paymentTransactions.status, ['awaiting_payment', 'pending']),
      ),
    )
    .orderBy(desc(paymentTransactions.createdAt))
    .limit(1);

  const reusable = existing[0];
  if (reusable?.providerChargeId && reusable.pixCopyPaste) {
    return {
      chargeId: reusable.providerChargeId,
      emv: reusable.pixCopyPaste,
      qrCode: reusable.pixQrCode ?? '',
      amountCents: reusable.amountCents,
      status: 'awaiting_payment',
    };
  }

  const token = await getAccessToken();
  const response = await fetch(`${env.paymentApiBaseUrl}/v1/charges/pix`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // A API trabalha em reais, nunca em centavos.
      amount: Number(centsToDecimalString(order.totalCents)),
      paymentMethod: 'pix',
      externalTxid: order.code,
      metadata: { orderId: order.id, orderCode: order.code },
      customer: {
        phone: toE164(order.customerPhone),
        ...(order.customerEmail ? { email: order.customerEmail } : {}),
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    logger.error('Falha ao criar cobrança Pix', { status: response.status, detail: detail.slice(0, 300) });
    throw serviceUnavailable('Não foi possível gerar o Pix agora. Tente novamente em instantes.');
  }

  const charge = (await response.json()) as { chargeId?: string; emv?: string; qrCode?: string };
  if (!charge.chargeId || !charge.emv) {
    throw serviceUnavailable('Resposta inesperada do provedor de pagamento.');
  }

  await db.insert(paymentTransactions).values({
    orderId,
    provider: PROVIDER,
    providerChargeId: charge.chargeId,
    status: 'awaiting_payment',
    amountCents: order.totalCents,
    pixCopyPaste: charge.emv,
    pixQrCode: charge.qrCode ?? null,
    rawPayload: { chargeId: charge.chargeId },
  });

  await db
    .update(orders)
    .set({ paymentStatus: 'awaiting_payment', updatedAt: new Date() })
    .where(eq(orders.id, orderId));

  return {
    chargeId: charge.chargeId,
    emv: charge.emv,
    qrCode: charge.qrCode ?? '',
    amountCents: order.totalCents,
    status: 'awaiting_payment',
  };
}

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
}

export interface SignatureCheck {
  valid: boolean;
  reason?: string;
}

/**
 * Valida `X-Webhook-Signature: t=<ms>,v1=<hmac hex>`.
 * O HMAC é calculado sobre `${t}.${corpo bruto}` — reserializar o JSON quebra
 * a assinatura, por isso o corpo chega aqui como Buffer.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
  now: number = Date.now(),
): SignatureCheck {
  if (!signatureHeader) return { valid: false, reason: 'missing_signature' };

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((part) => {
      const index = part.indexOf('=');
      return index === -1 ? [part.trim(), ''] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
    }),
  ) as { t?: string; v1?: string };

  if (!parts.t || !parts.v1) return { valid: false, reason: 'malformed_signature' };

  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp)) return { valid: false, reason: 'malformed_timestamp' };

  // Sem janela de tolerância, uma assinatura capturada valeria para sempre.
  if (Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_MS) {
    return { valid: false, reason: 'expired_signature' };
  }

  const expected = createHmac('sha256', secret)
    .update(`${parts.t}.${rawBody.toString('utf8')}`)
    .digest('hex');

  const provided = parts.v1;
  if (provided.length !== expected.length) return { valid: false, reason: 'signature_mismatch' };
  if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return { valid: false, reason: 'signature_mismatch' };
  }
  return { valid: true };
}

export interface WebhookPayload {
  event?: string;
  chargeId?: string;
  amount?: number;
  status?: string;
  paidAt?: string | null;
  metadata?: { orderId?: string; orderCode?: string } | null;
}

export interface WebhookOutcome {
  handled: boolean;
  reason: string;
  orderId?: string;
}

/**
 * Processa o webhook do provedor. Só confirma pagamento quando:
 *  1. o evento é de sucesso;
 *  2. a cobrança pertence a um pedido conhecido;
 *  3. o valor pago confere com o total do pedido.
 */
export async function handlePaymentWebhook(
  rawBody: Buffer,
  headers: { signature?: string; eventId?: string },
): Promise<WebhookOutcome> {
  if (!env.paymentWebhookSecret) {
    throw serviceUnavailable('Webhook de pagamento não configurado.');
  }

  const check = verifyWebhookSignature(rawBody, headers.signature, env.paymentWebhookSecret);
  if (!check.valid) {
    logger.warn('Webhook de pagamento rejeitado', { reason: check.reason });
    throw unauthorized('Assinatura do webhook inválida.');
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString('utf8')) as WebhookPayload;
  } catch {
    throw badRequest('Payload do webhook inválido.');
  }

  const db = getDb();
  const externalId = headers.eventId ?? `${payload.event ?? 'unknown'}:${payload.chargeId ?? 'unknown'}`;

  // Entrega "pelo menos uma vez": o mesmo evento pode chegar de novo.
  const inserted = await db
    .insert(webhookEvents)
    .values({
      provider: PROVIDER,
      externalId,
      eventType: payload.event ?? 'unknown',
      payload: payload as object,
    })
    .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.externalId] })
    .returning({ id: webhookEvents.id });

  if (!inserted[0]) return { handled: false, reason: 'duplicate_event' };

  const outcome = await applyWebhook(payload);

  await db
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(webhookEvents.id, inserted[0].id));

  return outcome;
}

async function applyWebhook(payload: WebhookPayload): Promise<WebhookOutcome> {
  const db = getDb();
  if (!payload.chargeId) return { handled: false, reason: 'missing_charge_id' };

  const transactions = await db
    .select()
    .from(paymentTransactions)
    .where(
      and(eq(paymentTransactions.provider, PROVIDER), eq(paymentTransactions.providerChargeId, payload.chargeId)),
    )
    .limit(1);

  let transaction = transactions[0];

  // Fallback de correlação: o metadata volta com o id do pedido.
  if (!transaction && payload.metadata?.orderId) {
    const byOrder = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.orderId, payload.metadata.orderId))
      .orderBy(desc(paymentTransactions.createdAt))
      .limit(1);
    transaction = byOrder[0];
  }

  if (!transaction) return { handled: false, reason: 'unknown_charge' };

  const event = payload.event ?? '';

  if (event === 'payment.success' && (payload.status ?? '').toUpperCase() === 'PAID') {
    const paidCents = Math.round((payload.amount ?? 0) * 100);
    if (paidCents !== transaction.amountCents) {
      logger.error('Valor pago diverge do pedido', {
        orderId: transaction.orderId,
        expected: transaction.amountCents,
        received: paidCents,
      });
      await db
        .update(paymentTransactions)
        .set({ status: 'failed', rawPayload: payload as object, updatedAt: new Date() })
        .where(eq(paymentTransactions.id, transaction.id));
      return { handled: false, reason: 'amount_mismatch', orderId: transaction.orderId };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(paymentTransactions)
        .set({ status: 'paid', rawPayload: payload as object, updatedAt: new Date() })
        .where(eq(paymentTransactions.id, transaction!.id));

      const current = await tx
        .select({ status: orders.status })
        .from(orders)
        .where(eq(orders.id, transaction!.orderId))
        .limit(1);

      await tx
        .update(orders)
        .set({ paymentStatus: 'paid', updatedAt: new Date() })
        .where(eq(orders.id, transaction!.orderId));

      // Pagamento confirmado move o pedido de "recebido" para "confirmado".
      if (current[0]?.status === 'received') {
        await tx
          .update(orders)
          .set({ status: 'confirmed', confirmedAt: new Date() })
          .where(eq(orders.id, transaction!.orderId));
        await tx.insert(orderStatusHistory).values({
          orderId: transaction!.orderId,
          fromStatus: 'received',
          toStatus: 'confirmed',
          note: 'Pagamento Pix confirmado pelo provedor.',
        });
      }
    });

    return { handled: true, reason: 'payment_confirmed', orderId: transaction.orderId };
  }

  if (event === 'charge.expired' || event === 'payment.failed') {
    await db
      .update(paymentTransactions)
      .set({
        status: event === 'charge.expired' ? 'cancelled' : 'failed',
        rawPayload: payload as object,
        updatedAt: new Date(),
      })
      .where(eq(paymentTransactions.id, transaction.id));
    await db
      .update(orders)
      .set({ paymentStatus: 'failed', updatedAt: new Date() })
      .where(eq(orders.id, transaction.orderId));
    return { handled: true, reason: event, orderId: transaction.orderId };
  }

  if (event === 'refund.confirmed') {
    await db
      .update(paymentTransactions)
      .set({ status: 'refunded', rawPayload: payload as object, updatedAt: new Date() })
      .where(eq(paymentTransactions.id, transaction.id));
    await db
      .update(orders)
      .set({ paymentStatus: 'refunded', updatedAt: new Date() })
      .where(eq(orders.id, transaction.orderId));
    return { handled: true, reason: 'refunded', orderId: transaction.orderId };
  }

  return { handled: false, reason: `ignored_event:${event}` };
}
