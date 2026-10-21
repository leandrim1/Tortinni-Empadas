import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { storeSettings, storeHours, deliveryRegions } from '../../db/schema';
import { notFound } from '../lib/errors';
import { env } from '../lib/env';
import { DEFAULT_MIN_ORDER_CENTS } from '../../shared/constants';

export type StoreSettingsRow = typeof storeSettings.$inferSelect;
export type StoreHourRow = typeof storeHours.$inferSelect;
export type DeliveryRegionRow = typeof deliveryRegions.$inferSelect;

export async function getStoreSettings(): Promise<StoreSettingsRow> {
  const db = getDb();
  const rows = await db.select().from(storeSettings).where(eq(storeSettings.id, 'singleton')).limit(1);
  const row = rows[0];
  if (!row) throw notFound('Configuração da loja não encontrada. Rode o seed do banco.');
  return row;
}

export async function getStoreHours(): Promise<StoreHourRow[]> {
  const db = getDb();
  return db.select().from(storeHours).orderBy(asc(storeHours.weekday));
}

/** Minutos desde a meia-noite no fuso configurado da loja. */
export function minutesInTimezone(date: Date, timezone: string): { weekday: number; minutes: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(lookup('hour')) % 24;
  const minute = Number(lookup('minute'));
  return { weekday: weekdayMap[lookup('weekday')] ?? 0, minutes: hour * 60 + minute };
}

function parseTime(value: string): number {
  const [h, m] = value.split(':');
  return Number(h) * 60 + Number(m);
}

export interface StoreStatus {
  isOpen: boolean;
  reason: 'open' | 'manually_closed' | 'outside_hours' | 'no_hours_configured';
  message: string;
  todayOpensAt?: string;
  todayClosesAt?: string;
}

/**
 * Status calculado a partir dos horários configurados, respeitando
 * fechamento manual e turnos que atravessam a meia-noite.
 */
export function computeStoreStatus(
  settings: Pick<StoreSettingsRow, 'manuallyClosed' | 'closedMessage' | 'timezone'>,
  hours: StoreHourRow[],
  now: Date = new Date(),
): StoreStatus {
  if (settings.manuallyClosed) {
    return {
      isOpen: false,
      reason: 'manually_closed',
      message: settings.closedMessage ?? 'Estamos fechados no momento.',
    };
  }
  if (hours.length === 0) {
    return {
      isOpen: false,
      reason: 'no_hours_configured',
      message: 'Horário de funcionamento ainda não configurado.',
    };
  }

  const { weekday, minutes } = minutesInTimezone(now, settings.timezone);
  const today = hours.find((h) => h.weekday === weekday);
  const yesterday = hours.find((h) => h.weekday === (weekday + 6) % 7);

  // Turno da véspera que avança madrugada adentro (ex.: 18:00 → 01:00).
  if (yesterday && !yesterday.isClosed) {
    const opens = parseTime(yesterday.opensAt);
    const closes = parseTime(yesterday.closesAt);
    if (closes < opens && minutes < closes) {
      return { isOpen: true, reason: 'open', message: 'Aberto agora', todayClosesAt: yesterday.closesAt };
    }
  }

  if (!today || today.isClosed) {
    return { isOpen: false, reason: 'outside_hours', message: 'Fechado hoje' };
  }

  const opens = parseTime(today.opensAt);
  const closes = parseTime(today.closesAt);
  const isOpen = closes > opens ? minutes >= opens && minutes < closes : minutes >= opens;

  return {
    isOpen,
    reason: isOpen ? 'open' : 'outside_hours',
    message: isOpen ? 'Aberto agora' : `Fechado · abre às ${today.opensAt}`,
    todayOpensAt: today.opensAt,
    todayClosesAt: today.closesAt,
  };
}

export async function getStoreStatus(now: Date = new Date()): Promise<StoreStatus> {
  const [settings, hours] = await Promise.all([getStoreSettings(), getStoreHours()]);
  return computeStoreStatus(settings, hours, now);
}

export function normalizeNeighborhood(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export async function listActiveRegions(): Promise<DeliveryRegionRow[]> {
  const db = getDb();
  return db
    .select()
    .from(deliveryRegions)
    .where(and(eq(deliveryRegions.isActive, true), isNull(deliveryRegions.deletedAt)))
    .orderBy(asc(deliveryRegions.sortOrder), asc(deliveryRegions.name));
}

export interface DeliveryQuote {
  region?: DeliveryRegionRow;
  feeCents: number;
  minOrderCents: number;
  etaMinMinutes: number;
  etaMaxMinutes: number;
  /** Falso quando o bairro informado não é atendido. */
  serviceable: boolean;
  message?: string;
}

/**
 * Resolve a taxa de entrega. Nunca inventa valor: se o bairro não está
 * cadastrado, devolve `serviceable: false` para o checkout avisar o cliente.
 */
export async function quoteDelivery(options: {
  fulfillment: 'delivery' | 'pickup';
  regionId?: string | null;
  neighborhood?: string | null;
}): Promise<DeliveryQuote> {
  const settings = await getStoreSettings();
  const baseMin = settings.minOrderCents ?? DEFAULT_MIN_ORDER_CENTS;

  if (options.fulfillment === 'pickup') {
    return {
      feeCents: 0,
      minOrderCents: baseMin,
      etaMinMinutes: settings.etaMinMinutes,
      etaMaxMinutes: settings.etaMaxMinutes,
      serviceable: settings.pickupEnabled,
      message: settings.pickupEnabled ? undefined : 'Retirada no local indisponível no momento.',
    };
  }

  if (!settings.deliveryEnabled) {
    return {
      feeCents: 0,
      minOrderCents: baseMin,
      etaMinMinutes: settings.etaMinMinutes,
      etaMaxMinutes: settings.etaMaxMinutes,
      serviceable: false,
      message: 'Entrega indisponível no momento.',
    };
  }

  const regions = await listActiveRegions();
  let region: DeliveryRegionRow | undefined;

  if (options.regionId) {
    region = regions.find((r) => r.id === options.regionId);
  } else if (options.neighborhood) {
    const key = normalizeNeighborhood(options.neighborhood);
    region = regions.find((r) => r.neighborhoodKey === key);
  }

  if (!region) {
    return {
      feeCents: 0,
      minOrderCents: baseMin,
      etaMinMinutes: settings.etaMinMinutes,
      etaMaxMinutes: settings.etaMaxMinutes,
      serviceable: false,
      message: options.neighborhood || options.regionId
        ? 'Ainda não entregamos neste bairro. Escolha retirada no local ou fale com a loja.'
        : 'Selecione o bairro para calcular a taxa de entrega.',
    };
  }

  return {
    region,
    feeCents: region.feeCents,
    minOrderCents: region.minOrderCents ?? baseMin,
    etaMinMinutes: region.etaMinMinutes ?? settings.etaMinMinutes,
    etaMaxMinutes: region.etaMaxMinutes ?? settings.etaMaxMinutes,
    serviceable: true,
  };
}

/** Formas de pagamento realmente habilitadas (config + credenciais presentes). */
export function availablePaymentMethods(settings: StoreSettingsRow) {
  const methods: { method: string; enabled: boolean; note?: string }[] = [];
  if (settings.acceptsPix) {
    methods.push({
      method: 'pix',
      enabled: true,
      note: env.onlinePaymentConfigured
        ? undefined
        : 'Pix com cobrança automática ainda não configurado: a chave é enviada pela loja após o pedido.',
    });
  }
  if (settings.acceptsCash) methods.push({ method: 'cash', enabled: true });
  if (settings.acceptsCardOnDelivery) methods.push({ method: 'card_on_delivery', enabled: true });
  if (settings.acceptsCardOnline) {
    methods.push({
      method: 'card_online',
      enabled: env.onlinePaymentConfigured,
      note: env.onlinePaymentConfigured ? undefined : 'Pagamento online pendente de configuração.',
    });
  }
  return methods;
}
