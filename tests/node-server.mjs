import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
const probe = createServer().listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const directory = mkdtempSync(join(tmpdir(), 'moya-node-test-'));
const origin = `http://localhost:${port}`;
const env = {
  ...process.env,
  PORT: String(port),
  HOST: '127.0.0.1',
  PUBLIC_ORIGIN: origin,
  DATABASE_PATH: join(directory, 'moya.sqlite'),
  MOYA_ADMIN_USER: 'test',
  MOYA_ADMIN_PASSWORD: 'test-only-not-a-real-secret-12345',
  MOYA_WORKSPACE_ID: 'node-integration-test',
  OPENAI_API_KEY: '',
  RELEASE_SHA: 'integration-test',
  NODE_ENV: 'production',
};
const authorization =
  'Basic ' +
  Buffer.from(`${env.MOYA_ADMIN_USER}:${env.MOYA_ADMIN_PASSWORD}`).toString(
    'base64',
  );
const base = `http://127.0.0.1:${port}`;
let child;
let output = '';
async function start() {
  child = spawn(process.execPath, ['server/start.mjs'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => {
    output += d;
  });
  child.stderr.on('data', (d) => {
    output += d;
  });
  for (let i = 0; i < 100; i++) {
    try {
      if (
        (
          await fetch(base + '/healthz', {
            headers: { authorization },
            signal: AbortSignal.timeout(500),
          })
        ).ok
      )
        return;
    } catch {}
    if (child.exitCode !== null)
      throw new Error('Node server stopped: ' + output);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Node server failed to start: ' + output);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}
async function request(path, options = {}) {
  return fetch(base + path, {
    ...options,
    headers: { authorization, ...options.headers },
    signal: AbortSignal.timeout(8000),
  });
}
try {
  await start();
  const smoke = spawn(
    process.execPath,
    ['scripts/health-check.mjs', '--full'],
    { env, stdio: 'inherit' },
  );
  assert.equal((await once(smoke, 'exit'))[0], 0);
  assert.equal(
    (
      await fetch(base + '/api/workspace', {
        headers: { 'oai-authenticated-user-id': 'forged' },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request('/api/workspace', {
        method: 'POST',
        headers: {
          Origin: 'https://untrusted.example',
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
    ).status,
    403,
  );
  const command = {
    type: 'open',
    table: 12,
    guests: 1,
    role: 'captain',
    commandId: crypto.randomUUID(),
  };
  const mutate = (body) =>
    request('/api/workspace', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const opened = await mutate(command);
  assert.equal(opened.status, 200);
  const state = await opened.json();
  const visit = state.visits.find((v) => v.table === 12 && v.phase === 'open');
  assert.ok(visit);
  const order = {
    type: 'order',
    role: 'guest',
    visitId: visit.id,
    commandId: crypto.randomUUID(),
    lines: [{ menuId: 'latte', quantity: 1 }],
  };
  const duplicate = await Promise.all([mutate(order), mutate(order)]);
  for (const response of duplicate) assert.equal(response.status, 200);
  await stop();
  await start();
  const restored = await (await request('/api/workspace')).json();
  assert.equal(
    restored.visits.find((v) => v.id === visit.id).items.length,
    1,
    'Order persists across restarts without duplication',
  );
  console.log(
    'Node production integration passed: authentication, menu/images, origin checks, persistent ordering and idempotency.',
  );
} finally {
  await stop();
  rmSync(directory, { recursive: true, force: true });
}
