import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { menu, categories, cafeCategories } from '../lib/menu.ts';
import { inOccasion } from '../lib/taste.ts';
import { guide } from '../lib/guide.ts';

void test('complete food and beverage snapshot preserves existing order references and all published photos', () => {
  const legacy = JSON.parse(
    readFileSync(new URL('../data/menu-legacy-ids.json', import.meta.url)),
  );
  assert.equal(new Set(menu.map((m) => m.id)).size, menu.length);
  assert.equal(new Set(menu.map((m) => m.sourceId)).size, menu.length);
  for (const [sourceId, old] of Object.entries(legacy))
    assert.equal(menu.find((m) => m.sourceId === sourceId)?.id, old.id);
  assert.ok(menu.length > 100);
  for (const item of menu) {
    assert.ok(categories.includes(item.category));
    assert.ok(
      item.name &&
        item.description &&
        Number.isSafeInteger(item.price) &&
        item.price > 0,
    );
    assert.doesNotMatch(item.description, /<\/?p>|&nbsp;/);
    if (item.image)
      assert.ok(
        existsSync(new URL('../public' + item.image, import.meta.url)),
        item.id,
      );
  }
  assert.ok(menu.filter((m) => m.category === 'نوشیدنی گرم').length > 5);
  assert.ok(menu.filter((m) => m.category === 'نوشیدنی سرد').length > 20);
  assert.ok(menu.some((m) => m.category === 'صبحانه'));
});

void test('cafe filtering includes cold drinks; all-menu restores every catalog category', () => {
  assert.ok(inOccasion('نوشیدنی سرد', 'cafe'));
  assert.ok(!inOccasion('غذای اصلی', 'cafe'));
  assert.ok(inOccasion('صبحانه', 'dining'));
  for (const category of categories.slice(1))
    assert.ok(inOccasion(category, 'both'));
  assert.deepEqual(
    new Set(
      menu.filter((m) => inOccasion(m.category, 'cafe')).map((m) => m.category),
    ),
    new Set(cafeCategories),
  );
});

void test('missing English titles do not match every query; cold drinks and breakfast stay in their requested sections', () => {
  assert.ok(menu.some((m) => m.en === ''));
  for (const [query, category] of [
    ['نوشیدنی سرد پیشنهاد بده', 'نوشیدنی سرد'],
    ['صبحانه پیشنهاد بده', 'صبحانه'],
  ]) {
    const answer = guide(query);
    assert.ok(answer.items.length > 0);
    assert.ok(
      answer.items.every(
        (id) => menu.find((m) => m.id === id).category === category,
      ),
    );
  }
  assert.deepEqual(guide('سوال کاملاً نامرتبط').items, []);
});
