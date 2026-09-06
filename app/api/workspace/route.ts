import { database } from '@/lib/db';
import {
  execute,
  initialState,
  type Command,
  type Workspace,
} from '@/lib/domain';
function owner(request: Request) {
  const url = new URL(request.url);
  if (
    process.env.NODE_ENV === 'development' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    return 'local-presentation';
  const id = request.headers.get('oai-authenticated-user-id');
  if (!id)
    throw new Error('برای ورود به فضای خصوصی ارائه، وارد حساب خود شوید.');
  // The hosting gateway verifies this identity. Each presenter has an isolated workspace.
  return id;
}
function response(state: Workspace) {
  return Response.json(
    { ...state, receipts: undefined },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
async function read(id: string) {
  const db = database();
  await db
    .prepare(
      'INSERT OR IGNORE INTO workspaces (owner,revision,data,updated_at) VALUES (?,0,?,?)',
    )
    .bind(id, JSON.stringify(initialState()), new Date().toISOString())
    .run();
  const row = await db
    .prepare('SELECT data, revision FROM workspaces WHERE owner = ?')
    .bind(id)
    .first<{ data: string; revision: number }>();
  if (!row) throw new Error('اطلاعات در دسترس نیست.');
  return { state: JSON.parse(row.data) as Workspace, revision: row.revision };
}
export async function GET(request: Request) {
  try {
    return response((await read(owner(request))).state);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'خطا در دریافت اطلاعات' },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  try {
    const id = owner(request);
    const origin = request.headers.get('origin');
    if (origin !== new URL(request.url).origin)
      return Response.json(
        { error: 'مبدأ درخواست معتبر نیست.' },
        { status: 403 },
      );
    const text = await request.text();
    if (text.length > 50000)
      return Response.json(
        { error: 'درخواست بیش از حد بزرگ است.' },
        { status: 413 },
      );
    const command = JSON.parse(text) as Command;
    for (let attempt = 0; attempt < 6; attempt++) {
      const { state, revision } = await read(id);
      const next = execute(state, command);
      if (next === state) return response(state);
      const result = await database()
        .prepare(
          'UPDATE workspaces SET data=?, revision=?, updated_at=? WHERE owner=? AND revision=?',
        )
        .bind(
          JSON.stringify(next),
          next.revision,
          new Date().toISOString(),
          id,
          revision,
        )
        .run();
      if (result.meta.changes === 1) return response(next);
    }
    return Response.json(
      { error: 'سفارش هم‌زمان تغییر کرده است. دوباره تلاش کنید.' },
      { status: 409 },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'ثبت انجام نشد.' },
      { status: 400 },
    );
  }
}
