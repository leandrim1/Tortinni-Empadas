import { sql } from 'drizzle-orm';
import { getDb } from './db';
import { rateLimits } from '../../db/schema';
import { tooManyRequests } from './errors';

export interface RateLimitRule {
  /** Identificador do balde, ex.: `login:${ip}`. */
  key: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Contador por janela fixa, persistido no banco.
 * Funções serverless não compartilham memória, então o estado precisa ser durável.
 * Um único UPSERT resolve leitura, reset de janela e incremento sem corrida.
 */
export async function consumeRateLimit(rule: RateLimitRule): Promise<RateLimitResult> {
  const db = getDb();
  const windowMs = rule.windowSeconds * 1000;

  const rows = await db
    .insert(rateLimits)
    .values({
      key: rule.key,
      count: 1,
      windowStartedAt: new Date(),
      expiresAt: new Date(Date.now() + windowMs),
    })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${rateLimits.expiresAt} < now() THEN 1 ELSE ${rateLimits.count} + 1 END`,
        windowStartedAt: sql`CASE WHEN ${rateLimits.expiresAt} < now() THEN now() ELSE ${rateLimits.windowStartedAt} END`,
        expiresAt: sql`CASE WHEN ${rateLimits.expiresAt} < now() THEN now() + ${sql.raw(`interval '${rule.windowSeconds} seconds'`)} ELSE ${rateLimits.expiresAt} END`,
      },
    })
    .returning({ count: rateLimits.count, expiresAt: rateLimits.expiresAt });

  const row = rows[0];
  if (!row) return { allowed: true, remaining: rule.limit - 1, retryAfterSeconds: 0 };

  const retryAfterSeconds = Math.max(
    0,
    Math.ceil((new Date(row.expiresAt).getTime() - Date.now()) / 1000),
  );
  return {
    allowed: row.count <= rule.limit,
    remaining: Math.max(0, rule.limit - row.count),
    retryAfterSeconds,
  };
}

/** Versão que lança 429 — usar nos endpoints sensíveis. */
export async function enforceRateLimit(rule: RateLimitRule, message?: string): Promise<void> {
  const result = await consumeRateLimit(rule);
  if (!result.allowed) {
    throw tooManyRequests(
      message ?? `Muitas tentativas. Tente novamente em ${result.retryAfterSeconds}s.`,
    );
  }
}

/** Limpeza oportunista de janelas expiradas. */
export async function pruneRateLimits(): Promise<void> {
  const db = getDb();
  await db.delete(rateLimits).where(sql`${rateLimits.expiresAt} < now() - interval '1 day'`);
}
