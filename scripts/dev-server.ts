import 'dotenv/config';
import { createServer } from 'node:http';
import { createApp } from '../server/app';
import { logger } from '../server/lib/logger';

const PORT = Number(process.env.API_PORT ?? 3001);
const app = createApp();

const server = createServer((req, res) => {
  void app.handle(req, res);
});

server.listen(PORT, () => {
  logger.info(`API de desenvolvimento em http://localhost:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
