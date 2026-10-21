import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppError } from './errors';
import { env } from './env';
import { logger } from './logger';

export const MAX_JSON_BODY_BYTES = 256 * 1024;
export const MAX_BINARY_BODY_BYTES = 6 * 1024 * 1024;

export type NodeReq = IncomingMessage & { body?: unknown };
export type NodeRes = ServerResponse;

export interface Cookie {
  name: string;
  value: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  path?: string;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export function serializeCookie(cookie: Cookie): string {
  const parts = [`${cookie.name}=${encodeURIComponent(cookie.value)}`];
  parts.push(`Path=${cookie.path ?? '/'}`);
  if (cookie.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(cookie.maxAge)}`);
  if (cookie.expires) parts.push(`Expires=${cookie.expires.toUTCString()}`);
  if (cookie.httpOnly !== false) parts.push('HttpOnly');
  if (cookie.secure ?? env.isProduction) parts.push('Secure');
  parts.push(`SameSite=${cookie.sameSite ?? 'Lax'}`);
  return parts.join('; ');
}

export function clientIp(req: NodeReq): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return (forwarded.split(',')[0] ?? '').trim() || 'unknown';
  }
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real) return real;
  return req.socket?.remoteAddress ?? 'unknown';
}

async function readRawBody(req: NodeReq, limit: number): Promise<Buffer> {
  // Em alguns runtimes (Vercel) o corpo já vem consumido e desserializado.
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return Buffer.from(req.body);
    return Buffer.from(JSON.stringify(req.body));
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buf.length;
    if (size > limit) throw new AppError(413, 'payload_too_large', 'Conteúdo enviado é grande demais.');
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

export async function readJsonBody(req: NodeReq): Promise<unknown> {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const raw = await readRawBody(req, MAX_JSON_BODY_BYTES);
  if (raw.length === 0) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new AppError(400, 'invalid_json', 'Corpo da requisição não é um JSON válido.');
  }
}

export async function readBinaryBody(req: NodeReq): Promise<Buffer> {
  return readRawBody(req, MAX_BINARY_BODY_BYTES);
}

export function applyCors(req: NodeReq, res: NodeRes): void {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && env.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-CSRF-Token, X-Tracking-Token, X-Admin-Bootstrap-Token',
  );
}

export function applySecurityHeaders(res: NodeRes): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

export function sendJson(res: NodeRes, status: number, payload: unknown, cookies: Cookie[] = []): void {
  if (!res.headersSent) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (cookies.length > 0) {
      res.setHeader('Set-Cookie', cookies.map(serializeCookie));
    }
  }
  res.end(JSON.stringify(payload));
}

/** Converte qualquer erro em resposta segura, sem vazar detalhes internos. */
export function sendError(res: NodeRes, error: unknown, requestId: string): void {
  if (error instanceof AppError) {
    sendJson(res, error.status, {
      error: { code: error.code, message: error.message, details: error.details ?? undefined },
      requestId,
    });
    return;
  }
  logger.error('Erro não tratado', {
    requestId,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  sendJson(res, 500, {
    error: { code: 'internal_error', message: 'Erro interno. Tente novamente em instantes.' },
    requestId,
  });
}
