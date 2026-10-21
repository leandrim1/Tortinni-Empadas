import { Router } from './lib/router';
import { registerPublicRoutes } from './routes/public';
import { registerAuthRoutes } from './routes/auth';
import { registerAdminRoutes } from './routes/admin';

let cached: Router | undefined;

/** Monta (uma vez por processo) o roteador usado tanto na Vercel quanto no dev-server. */
export function createApp(): Router {
  if (cached) return cached;
  const router = new Router();

  router.get('/api/health', async () => ({ ok: true, time: new Date().toISOString() }));

  registerPublicRoutes(router);
  registerAuthRoutes(router);
  registerAdminRoutes(router);

  cached = router;
  return router;
}
