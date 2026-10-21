import { env } from '../lib/env';
import { logger } from '../lib/logger';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailResult {
  delivered: boolean;
  provider: string;
  reason?: string;
}

/**
 * Envio de e-mail com provedor plugável.
 * Sem credenciais configuradas, o e-mail NÃO é enviado — e o sistema diz isso
 * com honestidade, em vez de fingir entrega.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (env.emailProvider === 'resend' && env.resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.emailFrom,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        logger.error('Falha no envio de e-mail', { status: response.status, detail: detail.slice(0, 300) });
        return { delivered: false, provider: 'resend', reason: 'provider_error' };
      }
      return { delivered: true, provider: 'resend' };
    } catch (error) {
      logger.error('Erro ao chamar provedor de e-mail', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { delivered: false, provider: 'resend', reason: 'network_error' };
    }
  }

  // Sem provedor: registra o assunto (nunca o token) para o operador saber que houve pedido.
  logger.warn('E-mail não enviado: provedor não configurado', {
    to: message.to,
    subject: message.subject,
  });
  return { delivered: false, provider: 'console', reason: 'not_configured' };
}

export function renderPasswordResetEmail(name: string, resetUrl: string): EmailMessage {
  return {
    to: '',
    subject: 'Redefinição de senha · Tortinni Empadas',
    text: `Olá, ${name}.\n\nRecebemos um pedido para redefinir sua senha. Acesse o link abaixo (válido por 1 hora):\n${resetUrl}\n\nSe não foi você, ignore este e-mail.`,
    html: `<p>Olá, ${escapeHtml(name)}.</p><p>Recebemos um pedido para redefinir sua senha. O link abaixo é válido por 1 hora:</p><p><a href="${escapeHtml(resetUrl)}">Redefinir minha senha</a></p><p>Se não foi você, ignore este e-mail.</p>`,
  };
}

export function renderVerificationEmail(name: string, verifyUrl: string): EmailMessage {
  return {
    to: '',
    subject: 'Confirme seu e-mail · Tortinni Empadas',
    text: `Olá, ${name}.\n\nConfirme seu e-mail para ativar sua conta:\n${verifyUrl}`,
    html: `<p>Olá, ${escapeHtml(name)}.</p><p>Confirme seu e-mail para ativar sua conta:</p><p><a href="${escapeHtml(verifyUrl)}">Confirmar e-mail</a></p>`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
