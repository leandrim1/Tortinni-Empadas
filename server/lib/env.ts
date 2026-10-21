/**
 * Acesso centralizado às variáveis de ambiente.
 * Este módulo NUNCA deve ser importado pelo código do navegador:
 * ele só existe no servidor (funções serverless / dev-server).
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

function required(name: string): string {
  const value = read(name);
  if (!value) {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${name}. Consulte o .env.example.`,
    );
  }
  return value;
}

export const env = {
  get nodeEnv(): string {
    return read('NODE_ENV') ?? 'development';
  },
  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  },
  get isTest(): boolean {
    return this.nodeEnv === 'test' || read('VITEST') === 'true';
  },
  get databaseUrl(): string {
    return required('DATABASE_URL');
  },
  get sessionSecret(): string {
    const secret = required('SESSION_SECRET');
    if (secret.length < 32) {
      throw new Error('SESSION_SECRET precisa ter ao menos 32 caracteres.');
    }
    return secret;
  },
  get publicSiteUrl(): string {
    return read('PUBLIC_SITE_URL') ?? 'http://localhost:5173';
  },
  get blobToken(): string | undefined {
    return read('BLOB_READ_WRITE_TOKEN');
  },
  get blobConfigured(): boolean {
    return Boolean(this.blobToken);
  },
  /** Provedor de e-mail: 'resend' | 'console' (padrão). */
  get emailProvider(): string {
    return read('EMAIL_PROVIDER') ?? 'console';
  },
  get resendApiKey(): string | undefined {
    return read('RESEND_API_KEY');
  },
  get emailFrom(): string {
    return read('EMAIL_FROM') ?? 'Tortinni Empadas <nao-responda@localhost>';
  },
  get emailConfigured(): boolean {
    return this.emailProvider === 'resend' && Boolean(this.resendApiKey);
  },
  /** Provedor de pagamento online: 'validapay' | undefined. */
  get paymentProvider(): string | undefined {
    return read('PAYMENT_PROVIDER');
  },
  get paymentApiBaseUrl(): string {
    return read('PAYMENT_API_BASE_URL') ?? 'https://api.validapay.com.br';
  },
  get paymentClientId(): string | undefined {
    return read('PAYMENT_CLIENT_ID');
  },
  get paymentClientSecret(): string | undefined {
    return read('PAYMENT_CLIENT_SECRET');
  },
  get paymentWebhookSecret(): string | undefined {
    return read('PAYMENT_WEBHOOK_SECRET');
  },
  /** Pagamento online só é oferecido quando todas as credenciais existem. */
  get onlinePaymentConfigured(): boolean {
    return Boolean(
      this.paymentProvider && this.paymentClientId && this.paymentClientSecret && this.paymentWebhookSecret,
    );
  },
  /** Origens aceitas pelo CORS/CSRF. */
  get allowedOrigins(): string[] {
    const raw = read('ALLOWED_ORIGINS');
    const fromEnv = raw ? raw.split(',').map((o) => o.trim()).filter(Boolean) : [];
    return [...new Set([this.publicSiteUrl, ...fromEnv])];
  },
  /** Token de uso único para criar o primeiro administrador. */
  get adminBootstrapToken(): string | undefined {
    return read('ADMIN_BOOTSTRAP_TOKEN');
  },
};

export function assertServerEnv(): void {
  env.databaseUrl;
  env.sessionSecret;
}
