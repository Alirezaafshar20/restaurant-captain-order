import { readFileSync } from 'node:fs';
import { openDatabase, applyMigrations } from './sqlite.mjs';
import { isAuthorized } from './auth.mjs';

if (
  !process.env.MOYA_ADMIN_USER ||
  (process.env.MOYA_ADMIN_PASSWORD || '').length < 20
)
  throw new Error(
    'Set MOYA_ADMIN_USER and a MOYA_ADMIN_PASSWORD of at least 20 characters.',
  );
const origin = new URL(process.env.PUBLIC_ORIGIN || 'http://localhost:3000');
if (
  !['https:', 'http:'].includes(origin.protocol) ||
  origin.pathname !== '/' ||
  origin.username ||
  origin.password ||
  origin.search ||
  origin.hash
)
  throw new Error('PUBLIC_ORIGIN must be an http(s) origin only.');
if (
  origin.protocol !== 'https:' &&
  !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
)
  throw new Error(
    'Public IP/domain requires HTTPS. For a private SSH tunnel use http://localhost:3000.',
  );
process.env.VINEXT_TRUST_PROXY = '1';
process.env.VINEXT_TRUSTED_HOSTS = origin.host;
const sqlite = openDatabase(process.env.DATABASE_PATH);
applyMigrations(
  sqlite,
  'drizzle',
  JSON.parse(readFileSync('dist/migrations.json', 'utf8')),
);
const catalog = JSON.parse(readFileSync('data/menu-catalog.json', 'utf8'));
const { startProdServer } = await import('vinext/server/prod-server');
const { server } = await startProdServer({
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 3000),
  outDir: 'dist',
});
const handlers = server.listeners('request');
server.removeAllListeners('request');
server.on('request', (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (
    !isAuthorized(
      req.headers.authorization,
      process.env.MOYA_ADMIN_USER,
      process.env.MOYA_ADMIN_PASSWORD,
    )
  ) {
    res.writeHead(401, {
      'WWW-Authenticate':
        'Basic realm="MOYA private presentation", charset="UTF-8"',
      'Cache-Control': 'no-store',
    });
    res.end('MOYA private presentation: sign in to continue.');
    return;
  }
  if (req.url === '/healthz') {
    try {
      sqlite.prepare('SELECT count(*) AS n FROM workspaces').get();
      sqlite.prepare('SELECT count(*) AS n FROM taste_profiles').get();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(
        JSON.stringify({
          ok: true,
          release: process.env.RELEASE_SHA || 'local',
          menuItems: catalog.items.length,
        }),
      );
    } catch {
      res.writeHead(503);
      res.end('Database unavailable');
    }
    return;
  }
  if (Number(req.headers['content-length'] || 0) > 65536) {
    res.writeHead(413);
    res.end('Request too large');
    return;
  }
  // Only this authenticated boundary can assign the shared presentation identity.
  for (const key of Object.keys(req.headers))
    if (key.startsWith('oai-') || key.startsWith('x-forwarded-'))
      delete req.headers[key];
  req.headers['oai-authenticated-user-id'] =
    process.env.MOYA_WORKSPACE_ID || 'moya-presentation';
  req.headers.host = origin.host;
  req.headers['x-forwarded-proto'] = origin.protocol.slice(0, -1);
  for (const handler of handlers) handler.call(server, req, res);
});
server.requestTimeout = 35000;
server.headersTimeout = 15000;
const shutdown = () => {
  server.close(() => {
    sqlite.close();
    process.exit(0);
  });
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 30000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
