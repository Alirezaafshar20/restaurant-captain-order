import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { emptyContext } from '../lib/taste.ts';
// Execute the actual API routes and SQL against isolated SQLite, never the user's demo data.
const sqlite = new DatabaseSync(':memory:');
for (const file of readdirSync('drizzle')
  .filter((f) => f.endsWith('.sql'))
  .sort())
  sqlite.exec(readFileSync('drizzle/' + file, 'utf8'));
function prepare(sql, values = []) {
  const statement = () => sqlite.prepare(sql);
  return {
    bind: (...args) => prepare(sql, args),
    first: async () => statement().get(...values) || null,
    run: async () => ({
      success: true,
      results: [],
      meta: { changes: Number(statement().run(...values).changes) },
    }),
    all: async () => ({ results: statement().all(...values) }),
    query: /^\s*SELECT/i.test(sql),
  };
}
globalThis.__tasteTestEnv = {
  DB: {
    prepare,
    batch: async (entries) => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const entry of entries)
          results.push(await (entry.query ? entry.all() : entry.run()));
        sqlite.exec('COMMIT');
        return results;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  },
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers')
      return {
        url: 'data:text/javascript,export const env = globalThis.__tasteTestEnv;',
        shortCircuit: true,
      };
    if (specifier.startsWith('@/'))
      return {
        url: pathToFileURL(resolve(specifier.slice(2) + '.ts')).href,
        shortCircuit: true,
      };
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      const candidate = new URL(specifier, context.parentURL);
      if (
        !/\.[a-z]+$/.test(candidate.pathname) &&
        existsSync(fileURLToPath(candidate) + '.ts')
      )
        return { url: candidate.href + '.ts', shortCircuit: true };
    }
    return next(specifier, context);
  },
});
process.env.NODE_ENV = 'production';
const { GET, POST } = await import('../app/api/taste/route.ts');
const origin = 'https://moya-tests.invalid';
const request = (owner, body, from = origin) =>
  new Request(origin + '/api/taste', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: from,
      ...(owner ? { 'oai-authenticated-user-id': owner } : {}),
    },
    body: JSON.stringify(body),
  });
const read = async (owner) =>
  (
    await GET(
      new Request(origin + '/api/taste', {
        headers: { 'oai-authenticated-user-id': owner },
      }),
    )
  ).json();
const send = async (owner, body) => {
  const r = await POST(request(owner, body));
  return { status: r.status, data: await r.json() };
};
test('profile consent, ownership, optimistic updates, learning, replay and deletion use real route SQL', async () => {
  assert.equal(
    (await POST(request('alice', {}, 'https://other.invalid'))).status,
    403,
  );
  assert.notEqual(
    (await POST(request(null, { action: 'save-profile' }))).status,
    200,
  );
  const preferences = emptyContext().preferences;
  const save = {
    action: 'save-profile',
    displayName: 'TEST ONLY',
    revision: 0,
    preferences,
    consent: true,
  };
  assert.equal((await send('alice', { ...save, consent: false })).status, 400);
  assert.equal((await send('alice', save)).status, 200);
  assert.equal((await read('bob')).profile, null);
  assert.equal((await send('alice', save)).status, 409);
  assert.equal(
    (await send('alice', { ...save, revision: 1, displayName: 'UPDATED TEST' }))
      .data.profile.revision,
    2,
  );
  const body = {
    action: 'recommend',
    requestId: crypto.randomUUID(),
    context: { ...emptyContext(), occasion: 'dining' },
    cartIds: [],
  };
  const first = await send('alice', body);
  assert.equal(first.status, 200);
  assert.deepEqual((await send('alice', body)).data, first.data);
  assert.equal((await read('alice')).decisions.length, 1);
  assert.equal((await read('bob')).decisions.length, 0);
  assert.equal(
    (
      await send('bob', {
        action: 'event',
        decisionId: body.requestId,
        itemId: first.data.selected[0],
        event: 'shown',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await send('alice', {
        action: 'event',
        decisionId: body.requestId,
        itemId: first.data.selected[0],
        event: 'shown',
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await send('alice', {
        action: 'event',
        decisionId: body.requestId,
        itemId: 'fake-item',
        event: 'shown',
      })
    ).status,
    400,
  );
  const feedback = {
    action: 'feedback',
    orderItemId: 'test-served-item',
    rating: 'like',
    mine: true,
  };
  assert.equal((await send('alice', feedback)).status, 400);
  const workspace = {
    visits: [
      {
        items: [{ id: 'test-served-item', menuId: 'ribeye', status: 'served' }],
      },
    ],
    unavailable: [],
  };
  sqlite
    .prepare(
      'INSERT INTO workspaces (owner,revision,data,updated_at) VALUES (?,0,?,?)',
    )
    .run('alice', JSON.stringify(workspace), new Date().toISOString());
  assert.equal((await send('alice', { ...feedback, mine: false })).status, 400);
  assert.equal((await send('alice', feedback)).status, 200);
  assert.equal((await send('alice', feedback)).data.feedback.length, 1);
  const learned = await send('alice', {
    ...body,
    requestId: crypto.randomUUID(),
  });
  assert.equal(learned.data.ranked[0].itemId, 'ribeye');
  assert.equal(
    (await send('alice', { ...feedback, rating: 'service' })).status,
    200,
  );
  const neutral = await send('alice', {
    ...body,
    requestId: crypto.randomUUID(),
  });
  assert.equal(neutral.data.ranked.find((r) => r.itemId === 'ribeye').score, 0);
  const exported = await send('alice', { action: 'export' });
  assert.equal(exported.data.format, 'captain-order-taste');
  assert.equal(
    (await send('alice', { action: 'forget', confirm: true })).status,
    200,
  );
  const erased = await read('alice');
  assert.equal(erased.profile, null);
  assert.equal(erased.feedback.length, 0);
  assert.equal(erased.decisions.length, 0);
  assert.equal((await send('alice', feedback)).status, 400);
  assert.ok(
    sqlite.prepare('SELECT owner FROM workspaces WHERE owner=?').get('alice'),
  );
});
test('knowledge drafts, provenance, role check and concurrent revision conflicts', async () => {
  const k = {
    itemId: 'ribeye',
    revision: 0,
    status: 'draft',
    flavors: ['sweet'],
    preparationMinutes: null,
    businessPriority: 2,
    pairings: [],
    source: '',
    verifiedBy: '',
    verifiedAt: null,
    notes: 'TEST ONLY',
  };
  assert.equal(
    (await send('alice', { action: 'knowledge', role: 'guest', knowledge: k }))
      .status,
    400,
  );
  assert.equal(
    (
      await send('alice', {
        action: 'knowledge',
        role: 'manager',
        knowledge: k,
      })
    ).status,
    200,
  );
  assert.equal((await read('bob')).knowledge.length, 0);
  assert.equal(
    (
      await send('alice', {
        action: 'knowledge',
        role: 'manager',
        knowledge: k,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await send('alice', {
        action: 'knowledge',
        role: 'manager',
        knowledge: { ...k, revision: 1, status: 'verified' },
      })
    ).status,
    400,
  );
});
test('deleting consent during a recommendation cannot restore its personal decision log', async () => {
  await send('race-test', {
    action: 'save-profile',
    displayName: 'TEST',
    preferences: emptyContext().preferences,
    consent: true,
    revision: 0,
  });
  const original = globalThis.__tasteTestEnv.DB.prepare;
  globalThis.__tasteTestEnv.DB.prepare = (sql) => {
    if (sql.startsWith('INSERT OR IGNORE INTO taste_decisions'))
      sqlite
        .prepare('DELETE FROM taste_profiles WHERE owner=?')
        .run('race-test');
    return original(sql);
  };
  try {
    const response = await send('race-test', {
      action: 'recommend',
      requestId: crypto.randomUUID(),
      context: { ...emptyContext(), occasion: 'cafe' },
      cartIds: [],
    });
    assert.equal(response.status, 409);
    assert.equal((await read('race-test')).decisions.length, 0);
  } finally {
    globalThis.__tasteTestEnv.DB.prepare = original;
  }
});
test.after(() => {
  hooks.deregister();
  sqlite.close();
  delete globalThis.__tasteTestEnv;
});
