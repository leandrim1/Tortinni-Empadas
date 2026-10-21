import { z } from 'zod';
import type { Router, RequestContext } from '../lib/router';
import { created } from '../lib/router';
import { parseOrThrow, parseQuery } from '../validators/common';
import { quoteSchema, createOrderSchema, trackOrderSchema } from '../validators/orders';
import {
  getStoreSettings,
  getStoreHours,
  computeStoreStatus,
  listActiveRegions,
  availablePaymentMethods,
} from '../services/store';
import { listCategories, listProducts, getProductBySlug, listFeatured, getMenu } from '../services/catalog';
import { quoteCart, createOrder, getOrderByTracking } from '../services/orders';
import { createPixChargeForOrder, handlePaymentWebhook, isOnlinePaymentConfigured } from '../services/payments';
import { withCustomer } from '../lib/session';
import { enforceRateLimit } from '../lib/rate-limit';
import { unauthorized } from '../lib/errors';
import { env } from '../lib/env';
import { STORE_INSTAGRAM_URL } from '../../shared/constants';
import { logger } from '../lib/logger';

const productQuerySchema = z.object({
  category: z.string().trim().max(120).optional(),
  search: z.string().trim().max(120).optional(),
  featured: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

export function registerPublicRoutes(router: Router): void {
  /** Vitrine: tudo que a home precisa em uma única chamada. */
  router.get('/api/store', async () => {
    const [settings, hours, regions] = await Promise.all([
      getStoreSettings(),
      getStoreHours(),
      listActiveRegions(),
    ]);
    const status = computeStoreStatus(settings, hours);

    return {
      store: {
        name: settings.name,
        tagline: settings.tagline,
        logoUrl: settings.logoUrl,
        bannerUrl: settings.bannerUrl,
        instagramUrl: settings.instagramUrl ?? STORE_INSTAGRAM_URL,
        whatsappNumber: settings.whatsappNumber,
        addressLine: settings.addressLine,
        minOrderCents: settings.minOrderCents,
        etaMinMinutes: settings.etaMinMinutes,
        etaMaxMinutes: settings.etaMaxMinutes,
        // Nota e número de avaliações só aparecem quando o administrador os informa.
        rating: settings.ratingValue
          ? { value: settings.ratingValue, count: settings.ratingCount ?? null }
          : null,
        announcement: settings.announcement,
        pickupEnabled: settings.pickupEnabled,
        deliveryEnabled: settings.deliveryEnabled,
        guestCheckoutEnabled: settings.guestCheckoutEnabled,
      },
      status,
      hours: hours.map((hour) => ({
        weekday: hour.weekday,
        opensAt: hour.opensAt,
        closesAt: hour.closesAt,
        isClosed: hour.isClosed,
      })),
      regions: regions.map((region) => ({
        id: region.id,
        name: region.name,
        feeCents: region.feeCents,
        minOrderCents: region.minOrderCents,
        etaMinMinutes: region.etaMinMinutes,
        etaMaxMinutes: region.etaMaxMinutes,
      })),
      paymentMethods: availablePaymentMethods(settings),
      integrations: {
        onlinePayment: isOnlinePaymentConfigured(),
        imageStorage: env.blobConfigured,
        email: env.emailConfigured,
      },
    };
  });

  router.get('/api/categories', async () => ({ categories: await listCategories(true) }));

  router.get('/api/products', async (ctx) => {
    const query = parseQuery(productQuerySchema, ctx.query);
    return listProducts({
      categorySlug: query.category,
      search: query.search,
      featuredOnly: query.featured === 'true',
      includeUnavailable: true,
      page: query.page,
      pageSize: query.pageSize,
    });
  });

  router.get('/api/products/featured', async () => ({ items: await listFeatured(8) }));

  router.get('/api/menu', async () => getMenu());

  router.get('/api/products/:slug', async (ctx) => ({
    product: await getProductBySlug(ctx.params.slug as string),
  }));

  /** Cotação: recalcula o carrinho no servidor antes do checkout. */
  router.post('/api/cart/quote', async (ctx) => {
    const input = parseOrThrow(quoteSchema, await ctx.json());
    return quoteCart({
      items: input.items,
      fulfillment: input.fulfillment,
      regionId: input.regionId ?? null,
      neighborhood: input.neighborhood ?? null,
    });
  });

  router.post('/api/orders', async (ctx: RequestContext) => {
    await enforceRateLimit(
      { key: `order:${ctx.ip}`, limit: 10, windowSeconds: 600 },
      'Muitos pedidos em sequência. Aguarde alguns minutos.',
    );

    const settings = await getStoreSettings();
    const auth = await withCustomer(ctx);
    if (!auth && !settings.guestCheckoutEnabled) {
      throw unauthorized('É necessário entrar na sua conta para finalizar o pedido.');
    }

    const input = parseOrThrow(createOrderSchema, await ctx.json());
    const order = await createOrder(input, { userId: auth?.subjectId ?? null, ip: ctx.ip });

    let pix: Awaited<ReturnType<typeof createPixChargeForOrder>> | null = null;
    let pixPending: string | undefined;

    if (input.paymentMethod === 'pix') {
      if (isOnlinePaymentConfigured()) {
        try {
          pix = await createPixChargeForOrder(order.id);
        } catch (error) {
          // O pedido já existe: a falha do Pix não pode derrubá-lo.
          logger.error('Falha ao gerar Pix para pedido criado', {
            orderId: order.id,
            error: error instanceof Error ? error.message : String(error),
          });
          pixPending = 'Não foi possível gerar o Pix agora. A loja entrará em contato para combinar o pagamento.';
        }
      } else {
        pixPending =
          'Pagamento Pix automático ainda não configurado. A loja enviará a chave Pix pelo WhatsApp.';
      }
    }

    return created({
      order: {
        id: order.id,
        code: order.code,
        status: order.status,
        totalCents: order.totalCents,
        trackingToken: order.trackingToken,
        trackingUrl: `${env.publicSiteUrl}/pedido/${order.code}?token=${encodeURIComponent(order.trackingToken)}`,
      },
      pix,
      pixPending,
    });
  });

  /** Acompanhamento sem login: código + token aleatório. */
  router.get('/api/orders/track', async (ctx) => {
    const input = parseOrThrow(trackOrderSchema, {
      code: ctx.query.get('code') ?? '',
      token: ctx.query.get('token') ?? '',
    });
    await enforceRateLimit({ key: `track:${ctx.ip}`, limit: 60, windowSeconds: 300 });
    return { order: await getOrderByTracking(input.code, input.token) };
  });

  /** Webhook do provedor de pagamento: assinatura validada com o corpo bruto. */
  router.post('/api/webhooks/payments', async (ctx) => {
    const raw = await ctx.rawBody();
    const signature = headerValue(ctx, 'x-webhook-signature');
    const eventId = headerValue(ctx, 'x-webhook-id');
    const outcome = await handlePaymentWebhook(raw, { signature, eventId });
    logger.info('Webhook de pagamento processado', { reason: outcome.reason, handled: outcome.handled });
    return { received: true, ...outcome };
  });
}

function headerValue(ctx: RequestContext, name: string): string | undefined {
  const value = ctx.req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
