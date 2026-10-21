/** Erro de aplicação: a mensagem é segura para exibir ao cliente. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'bad_request', message, details);

export const unauthorized = (message = 'É necessário entrar na sua conta.') =>
  new AppError(401, 'unauthorized', message);

export const forbidden = (message = 'Você não tem permissão para esta ação.') =>
  new AppError(403, 'forbidden', message);

export const notFound = (message = 'Registro não encontrado.') =>
  new AppError(404, 'not_found', message);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'conflict', message, details);

export const unprocessable = (message: string, details?: unknown) =>
  new AppError(422, 'unprocessable', message, details);

export const tooManyRequests = (message = 'Muitas tentativas. Aguarde um instante.') =>
  new AppError(429, 'too_many_requests', message);

export const serviceUnavailable = (message: string) =>
  new AppError(503, 'service_unavailable', message);
