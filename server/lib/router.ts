import { randomUUID } from 'node:crypto';
import {
  type NodeReq,
  type NodeRes,
  type Cookie,
  parseCookies,
  readJsonBody,
  readBinaryBody,
  clientIp,
  sendJson,
  sendError,
  applyCors,
  applySecurityHeaders,
  serializeCookie,
} from './http';
import { AppError, notFound } from './errors';
import { logger } from './logger';

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RequestContext {
  req: NodeReq;
  res: NodeRes;
  method: Method;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  cookies: Record<string, string>;
  ip: string;
  requestId: string;
  /** Lazy: só lê o corpo quando a rota precisa. */
  json<T = unknown>(): Promise<T>;
  /** Corpo bruto, byte a byte — exigido para validar assinatura de webhook. */
  rawBody(): Promise<Buffer>;
  setCookie(cookie: Cookie): void;
  /** Preenchido pelos middlewares de autenticação. */
  auth?: AuthContext;
}

export interface AuthContext {
  sessionId: string;
  subjectType: 'customer' | 'admin';
  subjectId: string;
  csrfSecret: string;
  role?: string;
}

export type Handler = (ctx: RequestContext) => Promise<unknown> | unknown;

interface Route {
  method: Method;
  segments: string[];
  handler: Handler;
}

/** Marcador para respostas que não devem ser embrulhadas em JSON 200. */
export class RawResult {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {}
}

export const noContent = () => new RawResult(204, null);
export const created = (payload: unknown) => new RawResult(201, payload);

export class Router {
  private routes: Route[] = [];

  add(method: Method, pattern: string, handler: Handler): this {
    this.routes.push({ method, segments: splitPath(pattern), handler });
    return this;
  }

  get = (p: string, h: Handler) => this.add('GET', p, h);
  post = (p: string, h: Handler) => this.add('POST', p, h);
  patch = (p: string, h: Handler) => this.add('PATCH', p, h);
  put = (p: string, h: Handler) => this.add('PUT', p, h);
  delete = (p: string, h: Handler) => this.add('DELETE', p, h);

  private match(method: string, path: string): { route: Route; params: Record<string, string> } | undefined {
    const parts = splitPath(path);
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i] as string;
        const part = parts[i] as string;
        if (seg.startsWith(':')) {
          params[seg.slice(1)] = decodeURIComponent(part);
        } else if (seg !== part) {
          ok = false;
          break;
        }
      }
      if (ok) return { route, params };
    }
    return undefined;
  }

  async handle(req: NodeReq, res: NodeRes): Promise<void> {
    const requestId = randomUUID();
    const startedAt = Date.now();
    applySecurityHeaders(res);
    applyCors(req, res);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;
    const cookies: Cookie[] = [];

    try {
      const matched = this.match(req.method ?? 'GET', path);
      if (!matched) throw notFound(`Rota não encontrada: ${req.method} ${path}`);

      let cachedBody: unknown;
      let bodyRead = false;
      let cachedRaw: Buffer | undefined;

      const ctx: RequestContext = {
        req,
        res,
        method: req.method as Method,
        path,
        params: matched.params,
        query: url.searchParams,
        cookies: parseCookies(req.headers.cookie),
        ip: clientIp(req),
        requestId,
        async json<T>() {
          if (!bodyRead) {
            cachedBody = cachedRaw
              ? (JSON.parse(cachedRaw.toString('utf8') || '{}') as unknown)
              : await readJsonBody(req);
            bodyRead = true;
          }
          return cachedBody as T;
        },
        async rawBody() {
          if (!cachedRaw) cachedRaw = await readBinaryBody(req);
          return cachedRaw;
        },
        setCookie(cookie: Cookie) {
          cookies.push(cookie);
        },
      };

      const result = await matched.route.handler(ctx);

      if (res.writableEnded) return;
      if (result instanceof RawResult) {
        if (result.status === 204) {
          if (cookies.length > 0) res.setHeader('Set-Cookie', cookies.map(serializeCookie));
          res.statusCode = 204;
          res.end();
        } else {
          sendJson(res, result.status, result.payload, cookies);
        }
      } else {
        sendJson(res, 200, result ?? {}, cookies);
      }
    } catch (error) {
      if (cookies.length > 0 && !res.headersSent) {
        res.setHeader('Set-Cookie', cookies.map(serializeCookie));
      }
      sendError(res, error, requestId);
    } finally {
      const duration = Date.now() - startedAt;
      if (duration > 1500) {
        logger.warn('Requisição lenta', { requestId, path, duration });
      }
    }
  }
}

function splitPath(path: string): string[] {
  return path.replace(/\/+$/, '').split('/').filter((s) => s.length > 0);
}

export { AppError };
