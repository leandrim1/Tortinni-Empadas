import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server/app';

/**
 * Função serverless única da Vercel. O corpo NÃO é parseado pela plataforma:
 * o roteador lê o stream por conta própria, o que preserva os bytes originais
 * exigidos pela validação de assinatura dos webhooks.
 */
export const config = { api: { bodyParser: false } };

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await createApp().handle(req, res);
}
