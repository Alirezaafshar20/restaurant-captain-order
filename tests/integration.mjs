import assert from 'node:assert/strict';
const base = process.env.MOYA_TEST_URL || 'http://localhost:3001';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname))
  throw new Error(
    'This test may only run against the local presentation server.',
  );
async function read() {
  const r = await fetch(base + '/api/workspace');
  assert.equal(r.status, 200);
  return r.json();
}
let s = await read();
const table = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].find(
  (t) =>
    !s.dirtyTables.includes(t) &&
    !s.visits.some((v) => v.table === t && v.phase === 'open'),
);
assert.ok(table, 'A free local table is needed for this test.');
async function send(c) {
  const r = await fetch(base + '/api/workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify(c),
  });
  const data = await r.json();
  assert.equal(r.status, 200, data.error);
  s = data;
  return data;
}
await send({
  type: 'open',
  table,
  guests: 1,
  role: 'captain',
  commandId: crypto.randomUUID(),
});
const visitId = s.visits.find(
  (v) => v.table === table && v.phase === 'open',
).id;
const make = (body) => ({
  role: 'captain',
  visitId,
  commandId: crypto.randomUUID(),
  ...body,
});
const order = make({
  type: 'order',
  role: 'guest',
  lines: [
    {
      menuId: 'latte',
      quantity: 1,
      note: 'آزمون اتصال سیستم؛ سفارش واقعی رستوران نیست',
    },
  ],
});
await Promise.all([send(order), send(order)]);
s = await read();
assert.equal(
  s.visits.find((v) => v.id === visitId).items.length,
  1,
  'duplicate order must not duplicate items',
);
await Promise.all([
  send(make({ type: 'order', lines: [{ menuId: 'espresso', quantity: 1 }] })),
  send(
    make({ type: 'order', lines: [{ menuId: 'iranian-tea', quantity: 1 }] }),
  ),
]);
s = await read();
let visit = s.visits.find((v) => v.id === visitId);
assert.equal(
  visit.items.length,
  3,
  'concurrent distinct writes must both survive',
);
for (const i of visit.items) {
  await send(make({ type: 'advance', itemId: i.id, status: 'held' }));
  await send(make({ type: 'advance', itemId: i.id, status: 'preparing' }));
  await send(
    make({ type: 'advance', role: 'kitchen', itemId: i.id, status: 'ready' }),
  );
  await send(make({ type: 'advance', itemId: i.id, status: 'served' }));
}
visit = s.visits.find((v) => v.id === visitId);
const amount = visit.items.reduce((n, i) => n + i.price * i.quantity, 0);
const payment = make({
  type: 'payment',
  role: 'cashier',
  amount,
  method: 'card',
  reference: 'TEST-' + visitId.slice(0, 8),
});
await Promise.all([send(payment), send(payment)]);
s = await read();
assert.equal(s.visits.find((v) => v.id === visitId).payments.length, 1);
await send(make({ type: 'depart' }));
assert.ok(s.dirtyTables.includes(table));
await send(make({ type: 'clean', table }));
assert.ok(!s.dirtyTables.includes(table));
const invalid = await fetch(base + '/api/workspace', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Origin: 'https://untrusted.example',
  },
  body: JSON.stringify(make({ type: 'open', table, guests: 2 })),
});
assert.equal(invalid.status, 403);
const guideResponse = await fetch(base + '/api/guide', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: base },
  body: JSON.stringify({ text: 'کالری ریب آی چقدر است؟' }),
});
assert.equal(guideResponse.status, 200);
assert.deepEqual((await guideResponse.json()).items, []);
console.log(
  'PASS: persisted cross-role lifecycle, concurrent distinct writes, duplicate order/payment protection, read-back, table cleaning, CSRF and calorie-safe guide.',
);
console.log(
  'A completed, internally labelled test visit remains in local history. No restaurant or banking system was contacted.',
);
