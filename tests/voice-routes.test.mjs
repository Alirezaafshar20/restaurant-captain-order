import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const sqlite = new DatabaseSync(':memory:');
for (const file of readdirSync('drizzle')
  .filter((f) => f.endsWith('.sql'))
  .sort())
  sqlite.exec(readFileSync('drizzle/' + file, 'utf8'));
function prepare(sql, values = []) {
  return {
    bind: (...args) => prepare(sql, args),
    all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
  };
}
globalThis.__voiceEnv = {
  DB: {
    prepare,
    batch: (entries) => Promise.all(entries.map((entry) => entry.all())),
  },
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers')
      return {
        url: 'data:text/javascript,export const env = globalThis.__voiceEnv;',
        shortCircuit: true,
      };
    if (specifier.startsWith('@/'))
      return {
        url: pathToFileURL(resolve(specifier.slice(2) + '.ts')).href,
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
process.env.NODE_ENV = 'production';
const { GET, POST } = await import('../app/api/voice/route.ts');
const origin = 'https://moya-voice-tests.invalid';
const sdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
function request(owner, body, from = origin) {
  return new Request(origin + '/api/voice', {
    method: 'POST',
    headers: {
      Origin: from,
      'Content-Type': 'application/json',
      ...(owner ? { 'oai-authenticated-user-id': owner } : {}),
    },
    body: JSON.stringify(body),
  });
}
test('voice route enforces identity, same origin, input size and configured service before provider access', async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('must not contact provider');
  };
  try {
    assert.equal((await GET(new Request(origin + '/api/voice'))).status, 401);
    assert.equal((await POST(request(null, { sdp }))).status, 401);
    assert.equal(
      (await POST(request('owner', { sdp }, 'https://elsewhere.invalid')))
        .status,
      403,
    );
    assert.equal(
      (await POST(request('owner', { sdp: sdp + 'x'.repeat(40000) }))).status,
      400,
    );
    assert.equal((await POST(request('owner', { sdp }))).status, 503);
  } finally {
    globalThis.fetch = saved;
  }
});
test('voice route limits session creation per owner and keeps provider secrets out of responses', async () => {
  const saved = globalThis.fetch;
  globalThis.__voiceEnv.OPENAI_API_KEY = 'private-test-key';
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(sdp);
  };
  try {
    for (let i = 0; i < 3; i++) {
      const response = await POST(request('owner', { sdp }));
      assert.equal(response.status, 200);
      assert.equal(await response.text(), sdp);
    }
    assert.equal((await POST(request('owner', { sdp }))).status, 429);
    assert.equal(calls, 3);
    assert.equal((await POST(request('another-owner', { sdp }))).status, 200);
    globalThis.fetch = async () =>
      new Response('private-test-key', { status: 401 });
    const error = await POST(request('third-owner', { sdp }));
    assert.equal(error.status, 502);
    assert.doesNotMatch(await error.text(), /private-test-key/);
  } finally {
    globalThis.fetch = saved;
    delete globalThis.__voiceEnv.OPENAI_API_KEY;
  }
});
test.after(() => {
  hooks.deregister();
  sqlite.close();
  delete globalThis.__voiceEnv;
});
