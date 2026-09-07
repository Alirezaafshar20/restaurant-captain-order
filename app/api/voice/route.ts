import { env } from 'cloudflare:workers';
import { database } from '@/lib/db';
import { workspaceOwner } from '@/lib/identity';
import {
  createVoiceCall,
  parseVoiceOffer,
  realtimeModel,
} from '@/lib/realtime';

function config() {
  const e = env as unknown as {
    OPENAI_API_KEY?: string;
    OPENAI_REALTIME_MODEL?: string;
  };
  return {
    key: e.OPENAI_API_KEY || '',
    model: e.OPENAI_REALTIME_MODEL || realtimeModel,
  };
}
export async function GET(request: Request) {
  try {
    workspaceOwner(request);
    return Response.json(
      { configured: !!config().key },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { error: 'برای گفت‌وگوی صوتی وارد فضای مویا بشین.' },
      { status: 401 },
    );
  }
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'مبدأ معتبر نیست.' }, { status: 403 });
  let owner: string;
  try {
    owner = workspaceOwner(request);
  } catch {
    return Response.json(
      { error: 'برای گفت‌وگوی صوتی وارد فضای مویا بشین.' },
      { status: 401 },
    );
  }
  let sdp: string;
  try {
    if (Number(request.headers.get('content-length') || 0) > 40000)
      throw new Error();
    sdp = parseVoiceOffer(await request.text());
  } catch {
    return Response.json(
      { error: 'درخواست تماس معتبر نیست.' },
      { status: 400 },
    );
  }
  const cfg = config();
  if (!cfg.key)
    return Response.json(
      {
        error:
          'گفت‌وگوی صوتی هنوز برای این نسخه فعال نشده. می‌تونین از راهنمای متنی استفاده کنین.',
      },
      { status: 503 },
    );
  try {
    const now = new Date().toISOString();
    const buckets = [
      owner + ':voice:minute:' + now.slice(0, 16),
      owner + ':voice:day:' + now.slice(0, 10),
    ];
    const usage = await database().batch(
      buckets.map((bucket) =>
        database()
          .prepare(
            'INSERT INTO ai_usage (bucket,count) VALUES (?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count',
          )
          .bind(bucket),
      ),
    );
    if (
      Number((usage[0].results[0] as { count: number }).count) > 3 ||
      Number((usage[1].results[0] as { count: number }).count) > 20
    )
      return Response.json(
        {
          error:
            'سقف شروع تماس این فضای ارائه رسیده. لطفاً از گفت‌وگوی متنی استفاده کنین.',
        },
        { status: 429 },
      );
    const answer = await createVoiceCall(sdp, cfg.key, cfg.model);
    return new Response(answer, {
      headers: {
        'Content-Type': 'application/sdp',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return Response.json(
      {
        error:
          'تماس برقرار نشد. دسترسی مدل صوتی، اعتبار حساب و اتصال اینترنت باید بررسی بشه؛ گفت‌وگوی متنی در دسترسه.',
      },
      { status: 502 },
    );
  }
}
