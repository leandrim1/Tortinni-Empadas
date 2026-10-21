/**
 * Ambiente de teste. Define as variáveis exigidas pelo servidor antes de
 * qualquer import de módulo que leia `env`.
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';
process.env.PUBLIC_SITE_URL ??= 'http://localhost:5173';
process.env.DATABASE_URL ??= 'postgres://localhost:5432/tortinni_test';
