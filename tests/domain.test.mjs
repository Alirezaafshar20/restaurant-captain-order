import test from 'node:test';
import assert from 'node:assert/strict';
import { execute, initialState, total, paid, due } from '../lib/domain.ts';
import { menu } from '../lib/menu.ts';
import { guide } from '../lib/guide.ts';
import { aiGuide } from '../lib/ai-guide.ts';
function fixture() {
  let state = initialState();
  const send = (body) => {
    const c = {
      commandId: crypto.randomUUID(),
      role: 'captain',
      visitId: state.visits[0]?.id,
      ...body,
    };
    state = execute(state, c);
    return c;
  };
  send({ type: 'open', table: 1, guests: 2 });
  return {
    send,
    get state() {
      return state;
    },
    get visit() {
      return state.visits[0];
    },
    get item() {
      return state.visits[0].items[0];
    },
  };
}
function order(f) {
  return f.send({
    type: 'order',
    role: 'guest',
    lines: [{ menuId: 'ribeye', quantity: 2, note: 'سس جدا' }],
    price: 1,
  });
}
function prepare(f) {
  order(f);
  f.send({ type: 'advance', itemId: f.item.id, status: 'held' });
  f.send({ type: 'advance', itemId: f.item.id, status: 'preparing' });
}
function serve(f) {
  prepare(f);
  f.send({
    type: 'advance',
    role: 'kitchen',
    itemId: f.item.id,
    status: 'ready',
  });
  f.send({ type: 'advance', itemId: f.item.id, status: 'served' });
}
void test('server prices and order idempotency', () => {
  const f = fixture();
  const c = order(f);
  assert.equal(total(f.visit), 7580000);
  const rev = f.state.revision;
  f.send(c);
  assert.equal(f.state.revision, rev);
  assert.equal(f.visit.items.length, 1);
  assert.equal(f.item.status, 'pending');
});
void test('kitchen cannot skip captain approval or impersonate manager', () => {
  const f = fixture();
  order(f);
  assert.throws(() =>
    f.send({
      type: 'advance',
      role: 'kitchen',
      itemId: f.item.id,
      status: 'ready',
    }),
  );
  assert.throws(() =>
    f.send({
      type: 'advance',
      role: 'guest',
      itemId: f.item.id,
      status: 'held',
    }),
  );
  assert.throws(() =>
    f.send({
      type: 'availability',
      role: 'cashier',
      menuId: 'ribeye',
      available: false,
    }),
  );
});
void test('unknown IDs, negative quantities and unavailable food cannot order', () => {
  const f = fixture();
  for (const line of [
    { menuId: 'invented', quantity: 1 },
    { menuId: 'ribeye', quantity: -1 },
    { menuId: 'ribeye', quantity: 1.5 },
  ])
    assert.throws(() => f.send({ type: 'order', lines: [line] }));
  f.send({
    type: 'availability',
    role: 'kitchen',
    menuId: 'ribeye',
    available: false,
  });
  assert.throws(() => order(f));
  assert.equal(f.visit.items.length, 0);
});
void test('full lifecycle records split payment without overcharging and separates departure/cleaning', () => {
  const f = fixture();
  serve(f);
  assert.throws(() =>
    f.send({
      type: 'payment',
      role: 'cashier',
      amount: total(f.visit) + 1,
      method: 'cash',
    }),
  );
  const payment = f.send({
    type: 'payment',
    role: 'cashier',
    amount: 1000000,
    method: 'card',
    reference: 'TEST-RECEIPT',
  });
  f.send(payment);
  assert.equal(paid(f.visit), 1000000);
  assert.throws(() => f.send({ type: 'depart' }));
  f.send({
    type: 'payment',
    role: 'cashier',
    amount: due(f.visit),
    method: 'cash',
  });
  assert.equal(due(f.visit), 0);
  assert.equal(f.visit.phase, 'open');
  f.send({ type: 'depart' });
  assert.deepEqual(f.state.dirtyTables, [1]);
  assert.throws(() => f.send({ type: 'open', table: 1, guests: 1 }));
  f.send({ type: 'clean', table: 1 });
  f.send({ type: 'open', table: 1, guests: 1 });
  assert.equal(f.state.visits.length, 2);
  assert.notEqual(f.state.visits[0].id, f.state.visits[1].id);
  assert.equal(f.state.visits[1].items.length, 0);
});
void test('unserved orders cannot settle; a departed visit cannot be reused', () => {
  const f = fixture();
  order(f);
  assert.throws(() =>
    f.send({ type: 'payment', role: 'cashier', amount: 1, method: 'cash' }),
  );
  const g = fixture();
  g.send({ type: 'depart' });
  assert.throws(() => order(g));
});
void test('moving a visit retains items, account and ID, and marks old table dirty', () => {
  const f = fixture();
  order(f);
  const id = f.visit.id;
  f.send({ type: 'move', table: 2 });
  assert.equal(f.visit.id, id);
  assert.equal(f.visit.table, 2);
  assert.equal(total(f.visit), 7580000);
  assert.deepEqual(f.state.dirtyTables, [1]);
});
void test('pending change blocks kitchen release and requires explicit guest consent', () => {
  const f = fixture();
  order(f);
  f.send({
    type: 'request',
    role: 'guest',
    kind: 'change',
    itemId: f.item.id,
    text: 'سس جدا',
  });
  const r = f.visit.requests[0];
  assert.throws(() =>
    f.send({ type: 'advance', itemId: f.item.id, status: 'held' }),
  );
  f.send({ type: 'claim', requestId: r.id });
  assert.throws(() =>
    f.send({
      type: 'edit',
      requestId: r.id,
      note: 'سس جدا',
      outcome: 'هماهنگ شد',
    }),
  );
  f.send({
    type: 'edit',
    requestId: r.id,
    note: 'سس جدا و بدون تغییر دیگر',
    outcome: 'مهمان تأیید کرد',
    guestConfirmed: true,
  });
  assert.equal(f.visit.requests[0].state, 'resolved');
  assert.equal(f.item.note, 'سس جدا و بدون تغییر دیگر');
});
void test('prepared changes preserve current revision until kitchen acceptance', () => {
  const f = fixture();
  prepare(f);
  f.send({
    type: 'request',
    role: 'guest',
    kind: 'change',
    itemId: f.item.id,
    text: 'سس بیشتر',
  });
  const id = f.visit.requests[0].id;
  f.send({ type: 'claim', requestId: id });
  assert.throws(() =>
    f.send({
      type: 'edit',
      requestId: id,
      note: 'سس بیشتر',
      outcome: 'تأیید مهمان',
      guestConfirmed: true,
    }),
  );
  f.send({
    type: 'propose-edit',
    requestId: id,
    note: 'سس بیشتر',
    guestConfirmed: true,
  });
  assert.equal(f.item.note, 'سس جدا');
  assert.throws(() =>
    f.send({ type: 'resolve', requestId: id, outcome: 'بی‌اطلاع از آشپزخانه' }),
  );
  assert.throws(() =>
    f.send({
      type: 'kitchen-decision',
      requestId: id,
      approved: true,
      outcome: 'امکان‌پذیر است',
    }),
  );
  f.send({
    type: 'kitchen-decision',
    role: 'kitchen',
    requestId: id,
    approved: true,
    outcome: 'سس جداگانه اضافه می‌شود',
  });
  assert.equal(f.item.note, 'سس بیشتر');
  assert.equal(f.visit.requests[0].state, 'resolved');
});
void test('kitchen rejection preserves food and requires captain follow-up', () => {
  const f = fixture();
  prepare(f);
  f.send({
    type: 'request',
    kind: 'change',
    itemId: f.item.id,
    text: 'تغییر غذا',
  });
  const id = f.visit.requests[0].id;
  f.send({ type: 'claim', requestId: id });
  f.send({
    type: 'propose-edit',
    requestId: id,
    note: 'تغییر غذا',
    guestConfirmed: true,
  });
  f.send({
    type: 'kitchen-decision',
    role: 'kitchen',
    requestId: id,
    approved: false,
    outcome: 'در این مرحله ممکن نیست',
  });
  assert.equal(f.item.note, 'سس جدا');
  assert.equal(f.visit.requests[0].state, 'claimed');
  f.send({
    type: 'resolve',
    requestId: id,
    outcome: 'به مهمان توضیح داده شد و پذیرفت',
  });
  assert.equal(f.visit.requests[0].state, 'resolved');
});
void test('preparation cancellation is applied only by kitchen and removes its charge', () => {
  const f = fixture();
  prepare(f);
  f.send({ type: 'request', kind: 'change', itemId: f.item.id, text: 'لغو' });
  const id = f.visit.requests[0].id;
  f.send({ type: 'claim', requestId: id });
  f.send({
    type: 'propose-edit',
    requestId: id,
    note: 'لغو با تأیید مهمان',
    guestConfirmed: true,
    cancel: true,
  });
  assert.equal(total(f.visit), 7580000);
  f.send({
    type: 'kitchen-decision',
    role: 'kitchen',
    requestId: id,
    approved: true,
    outcome: 'لغو ممکن است',
  });
  assert.equal(total(f.visit), 0);
});
void test('guide never fabricates calories or allergy-safe results', () => {
  assert.deepEqual(guide('کالری ریب آی').items, []);
  assert.deepEqual(guide('حساسیت به گردو دارم').items, []);
  assert.deepEqual(guide('مرغ نمی‌خواهم').items, []);
  assert.ok(guide('غذای دریایی می‌خواهم').items.includes('seabass'));
  assert.ok(
    !guide('غذای دریایی می‌خواهم', ['seabass']).items.includes('seabass'),
  );
});
void test('AI absent uses working menu fallback without any external request', async () => {
  const r = await aiGuide(
    'دریایی',
    [],
    [],
    { apiKey: '', model: 'gpt-4.1-mini' },
    () => {
      throw new Error('must not fetch');
    },
  );
  assert.equal(r.mode, 'menu');
  assert.ok(r.items.length);
});
void test('AI structured selection only returns server-owned prices and descriptions', async () => {
  const r = await aiGuide(
    'دریایی',
    [],
    [],
    { apiKey: 'test-only', model: 'gpt-4.1-mini' },
    async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const body = JSON.parse(options.body);
      assert.equal(body.store, false);
      assert.ok(!JSON.stringify(body).includes('test-only'));
      return Response.json({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  intent: 'recommend',
                  itemIds: ['seabass'],
                  question: 'none',
                }),
              },
            ],
          },
        ],
      });
    },
  );
  assert.equal(r.mode, 'ai');
  assert.deepEqual(r.items, ['seabass']);
  assert.ok(r.text.includes(menu.find((m) => m.id === 'seabass').description));
});
void test('invalid AI item ID and provider errors fail safely into menu guide', async () => {
  const r = await aiGuide(
    'دریایی',
    [],
    [],
    { apiKey: 'test-only', model: 'gpt-4.1-mini' },
    async () =>
      Response.json({
        status: 'completed',
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: '{"intent":"recommend","itemIds":["invented"],"question":"none"}',
              },
            ],
          },
        ],
      }),
  );
  assert.equal(r.mode, 'fallback');
  assert.ok(r.items.every((id) => menu.some((m) => m.id === id)));
});
void test('allergy context in prior turn does not reach external model', async () => {
  const r = await aiGuide(
    'چه پیشنهادی داری؟',
    [{ role: 'user', text: 'حساسیت به شیر دارم' }],
    [],
    { apiKey: 'test-only', model: 'gpt-4.1-mini' },
    () => {
      throw new Error('must not fetch');
    },
  );
  assert.equal(r.mode, 'menu');
  assert.deepEqual(r.items, []);
});
