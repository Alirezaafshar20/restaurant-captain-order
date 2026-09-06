import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyContext,
  parsePreferences,
  parseKnowledge,
  recommend,
  portableProfile,
} from '../lib/taste.ts';
import { menu } from '../lib/menu.ts';
import { guide } from '../lib/guide.ts';
const now = '2026-09-06T18:00:00.000Z';
test('coffee-only and tea-only requests remain distinct without an AI key', () => {
  assert.deepEqual(
    new Set(guide('قهوه پیشنهاد بده').items),
    new Set(['espresso', 'latte', 'cappuccino']),
  );
  assert.ok(guide('چای پیشنهاد بده').items.every((id) => id.endsWith('-tea')));
});
const run = (context, knowledge = [], feedback = [], unavailable = []) =>
  recommend(
    context,
    unavailable,
    knowledge,
    feedback,
    [],
    'test-decision',
    now,
  );
const knowledge = (id, overrides = {}) => ({
  itemId: id,
  status: 'verified',
  revision: 1,
  flavors: ['sweet'],
  preparationMinutes: 10,
  businessPriority: 0,
  pairings: [],
  source: 'TEST ONLY',
  verifiedBy: 'TEST ONLY',
  verifiedAt: now,
  notes: '',
  ...overrides,
});
test('asks visit purpose first and keeps a cafe-only visit out of main dishes', () => {
  assert.equal(run(emptyContext()).action, 'ask-occasion');
  const d = run({ ...emptyContext(), occasion: 'cafe' });
  assert.ok(d.selected.length > 0);
  assert.ok(
    d.ranked.every((r) =>
      ['دسر', 'نوشیدنی گرم'].includes(
        menu.find((m) => m.id === r.itemId).category,
      ),
    ),
  );
});
test('budget, current exclusions and availability are hard constraints', () => {
  const item = menu.find((m) => m.category === 'نوشیدنی گرم');
  const c = { ...emptyContext(), occasion: 'both' };
  c.preferences.maxPrice = item.price;
  c.preferences.avoidIds = [item.id];
  const blocked = menu
    .filter((m) => m.id !== item.id && m.price <= item.price)
    .map((m) => m.id);
  assert.equal(
    run(c, [knowledge(item.id, { businessPriority: 2 })], [], blocked).action,
    'handoff',
  );
});
test('draft knowledge cannot boost taste or promise preparation time', () => {
  const c = { ...emptyContext(), occasion: 'both', quick: true };
  c.preferences.flavors = ['sweet'];
  const d = run(c, [knowledge('ribeye', { status: 'draft' })]);
  assert.equal(d.ranked.find((r) => r.itemId === 'ribeye').score, 0);
  assert.ok(
    !d.ranked
      .find((r) => r.itemId === 'ribeye')
      .reasons.some((r) => r.includes('دقیقه')),
  );
});
test('business priority only breaks ties and cannot beat customer fit', () => {
  const c = { ...emptyContext(), occasion: 'both' };
  c.preferences.categories = ['نوشیدنی گرم'];
  const d = run(c, [knowledge('ribeye', { businessPriority: 2 })]);
  assert.equal(
    menu.find((m) => m.id === d.ranked[0].itemId).category,
    'نوشیدنی گرم',
  );
  assert.ok(d.ranked.findIndex((r) => r.itemId === 'ribeye') > 0);
});
test('own taste feedback changes ranking; service feedback and companions do not', () => {
  const c = { ...emptyContext(), occasion: 'dining' };
  const f = {
    orderItemId: 'served-self',
    menuId: 'ribeye',
    rating: 'like',
    at: now,
  };
  assert.equal(run(c, [], [f]).ranked[0].itemId, 'ribeye');
  assert.equal(
    run(c, [], [{ ...f, rating: 'service' }]).ranked.find(
      (r) => r.itemId === 'ribeye',
    ).score,
    0,
  );
  assert.equal(
    run({ ...c, mine: false }, [], [f]).ranked.find(
      (r) => r.itemId === 'ribeye',
    ).score,
    0,
  );
  c.preferences.avoidIds = ['ribeye'];
  assert.ok(!run(c, [], [f]).ranked.some((r) => r.itemId === 'ribeye'));
});
test('urgency suppresses proactive selling but not requested assistance', () => {
  const c = { ...emptyContext(), occasion: 'cafe', quick: true };
  assert.equal(run({ ...c, source: 'proactive' }).action, 'wait');
  assert.equal(run(c).action, 'recommend');
});
test('profile and kitchen knowledge validate unknown values and provenance', () => {
  assert.throws(() =>
    parsePreferences({
      ...emptyContext().preferences,
      categories: ['invented'],
    }),
  );
  assert.throws(() =>
    parsePreferences({ ...emptyContext().preferences, maxPrice: -1 }),
  );
  assert.throws(() => parseKnowledge(knowledge('ribeye', { source: '' }), now));
  assert.equal(
    parseKnowledge(
      knowledge('ribeye', { status: 'draft', source: '', verifiedBy: '' }),
      now,
    ).verifiedAt,
    null,
  );
});
test('portable export separates personal flavor from restaurant-specific choices', () => {
  const profile = {
    displayName: 'Private name',
    revision: 1,
    consentAt: now,
    preferences: {
      categories: ['نوشیدنی گرم'],
      flavors: ['bitter'],
      avoidIds: ['ribeye'],
      maxPrice: 500000,
    },
  };
  const exported = portableProfile(profile);
  assert.deepEqual(exported.portable, { flavors: ['bitter'] });
  assert.deepEqual(exported.restaurants.moya.avoidIds, ['ribeye']);
  assert.equal(exported.displayName, undefined);
  assert.equal(exported.sharing, 'user-controlled-export');
});
test('current explicit flavor outranks learned preference and old evidence fades', () => {
  const c = { ...emptyContext(), occasion: 'dining' };
  c.preferences.flavors = ['sweet'];
  const f = {
    orderItemId: 'old-order',
    menuId: 'ribeye',
    rating: 'like',
    at: now,
  };
  const d = run(
    c,
    [knowledge('filet')],
    [f, { ...f, orderItemId: 'another-order' }],
  );
  assert.equal(d.ranked[0].itemId, 'filet');
  const old = run(c, [], [{ ...f, at: '2025-09-06T18:00:00.000Z' }]);
  assert.ok(old.ranked.find((r) => r.itemId === 'ribeye').score < 1);
});
