import { env } from 'cloudflare:workers';
import { aiGuide } from '@/lib/ai-guide';
import { database } from '@/lib/db';
import { workspaceOwner } from '@/lib/identity';
import type { Workspace } from '@/lib/domain';
import { parseContext, recommend, type Decision } from '@/lib/taste';
import { tasteSnapshot } from '@/lib/taste-store';
function config() {
  const e = env as unknown as {
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
  };
  return {
    apiKey: e.OPENAI_API_KEY || '',
    model: e.OPENAI_MODEL || 'gpt-4.1-mini',
  };
}
export async function GET() {
  return Response.json(
    { configured: !!config().apiKey },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'مبدأ معتبر نیست.' }, { status: 403 });
  try {
    const owner = workspaceOwner(request);
    const raw = await request.text();
    if (raw.length > 16000) throw new Error('پیام بیش از حد طولانی است.');
    const { text, history = [], tasteContext } = JSON.parse(raw);
    if (
      typeof text !== 'string' ||
      !text.trim() ||
      text.length > 500 ||
      !Array.isArray(history) ||
      history.length > 8 ||
      history.some(
        (m) =>
          !m ||
          !['user', 'assistant'].includes(m.role) ||
          typeof m.text !== 'string' ||
          m.text.length > 1500,
      )
    )
      throw new Error('پیام معتبر نیست.');
    const row = await database()
      .prepare('SELECT data FROM workspaces WHERE owner=?')
      .bind(owner)
      .first<{ data: string }>();
    let unavailable = row
      ? (JSON.parse(row.data) as Workspace).unavailable
      : [];
    const cfg = config();
    let ranking: Decision | null = null;
    let selectionContext = '';
    if (tasteContext) {
      const context = parseContext(tasteContext);
      const snapshot = await tasteSnapshot(owner);
      ranking = recommend(
        context,
        unavailable,
        snapshot.knowledge,
        snapshot.profile ? snapshot.feedback : [],
        [],
        'conversation',
        new Date().toISOString(),
      );
      unavailable = [
        ...new Set([...unavailable, ...ranking.excluded.map((e) => e.itemId)]),
      ];
      selectionContext = JSON.stringify({
        occasion: context.occasion,
        preferences: context.preferences,
        rankedMenuIds: ranking.ranked.map((r) => r.itemId),
      });
    }
    if (cfg.apiKey) {
      const now = new Date().toISOString();
      const buckets = [
        owner + ':minute:' + now.slice(0, 16),
        owner + ':day:' + now.slice(0, 10),
      ];
      const result = await database().batch(
        buckets.map((bucket) =>
          database()
            .prepare(
              'INSERT INTO ai_usage (bucket,count) VALUES (?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count',
            )
            .bind(bucket),
        ),
      );
      if (
        Number((result[0].results[0] as { count: number }).count) > 15 ||
        Number((result[1].results[0] as { count: number }).count) > 200
      )
        return Response.json(
          {
            error:
              'سقف پیام‌های این فضای ارائه رسیده است؛ کمی بعد دوباره تلاش کنید.',
          },
          { status: 429 },
        );
    }
    const answer = await aiGuide(text, history, unavailable, {
      ...cfg,
      selectionContext,
      rankedIds: ranking?.ranked.map((r) => r.itemId),
    });
    return Response.json(answer, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'پیام معتبر نیست.' },
      { status: 400 },
    );
  }
}
