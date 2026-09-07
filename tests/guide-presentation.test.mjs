import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { aiGuide } from '../lib/ai-guide.ts';
import { guidePresentation } from '../lib/guide-presentation.ts';
import { menu } from '../lib/menu.ts';

void test('coffee cards have actual local restaurant assets and comparison uses published milk amounts', () => {
  for (const id of [
    'espresso',
    'latte',
    'cappuccino',
    'iranian-tea',
    'moroccan-tea',
  ]) {
    const item = menu.find((m) => m.id === id);
    assert.ok(
      item.image &&
        existsSync(new URL('../public' + item.image, import.meta.url)),
    );
  }
  const view = guidePresentation(['latte', 'cappuccino'], 'none', 'compare');
  assert.match(view.lead, /۲۲۰/);
  assert.match(view.lead, /۱۸۰/);
  assert.equal(view.followUp, undefined);
  assert.doesNotMatch(view.lead, /کافئین|کالری|ایمن/);
});

void test('cafe follow-up never asks about meat and each prompt offers one decision', () => {
  for (const ids of [[], ['espresso'], ['iranian-tea']]) {
    const view = guidePresentation(ids, 'preference', 'clarify', true);
    assert.doesNotMatch(view.followUp.text, /گوشت|مرغ|دریایی/);
    assert.equal(view.followUp.choices.length, 3);
  }
  assert.deepEqual(
    guidePresentation(['espresso'], 'coffee_style').followUp.choices,
    ['قهوه با شیر می‌پسندم', 'اسپرسو را نشان بده'],
  );
});

void test('Astra card response keeps menu facts in conversation history with a bounded useful question', async () => {
  const answer = await aiGuide(
    'قهوه می‌خواهم',
    [],
    [],
    { apiKey: 'test-only', model: 'gpt-6-astra' },
    async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.reasoning.effort, 'low');
      assert.equal(body.store, false);
      assert.equal(body.tools, undefined);
      return Response.json({
        status: 'completed',
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  intent: 'recommend',
                  itemIds: ['espresso', 'latte'],
                  question: 'coffee_style',
                }),
              },
            ],
          },
        ],
      });
    },
  );
  assert.equal(answer.mode, 'ai');
  assert.ok(answer.lead);
  assert.match(answer.text, /لاته/);
  assert.match(answer.text, /۲۲۰/);
  assert.equal(answer.followUp.choices.length, 2);
});

void test('off-topic and handoff suppress cards even when a provider returns item IDs', async () => {
  for (const intent of ['off_topic', 'handoff']) {
    const answer = await aiGuide(
      'سوال دیگری دارم',
      [],
      [],
      { apiKey: 'test-only', model: 'gpt-6-astra' },
      async () =>
        Response.json({
          status: 'completed',
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    intent,
                    itemIds: ['latte'],
                    question: 'coffee_style',
                  }),
                },
              ],
            },
          ],
        }),
    );
    assert.deepEqual(answer.items, []);
    assert.equal(answer.followUp, undefined);
  }
});
