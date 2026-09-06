import { database } from '@/lib/db';
import { workspaceOwner } from '@/lib/identity';
import { tasteSnapshot } from '@/lib/taste-store';
import {
  parsePreferences,
  parseContext,
  parseKnowledge,
  recommend,
  portableProfile,
  type Profile,
  type Decision,
} from '@/lib/taste';
import type { Workspace } from '@/lib/domain';
import { menu } from '@/lib/menu';
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
function check(ok: unknown, text: string): asserts ok {
  if (!ok) throw new Error(text);
}
export async function GET(request: Request) {
  try {
    return json(await tasteSnapshot(workspaceOwner(request)));
  } catch {
    return json({ error: 'اطلاعات سلیقه دریافت نشد؛ دوباره تلاش کنید.' }, 503);
  }
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return json({ error: 'مبدأ معتبر نیست.' }, 403);
  try {
    const owner = workspaceOwner(request),
      db = database();
    const raw = await request.text();
    check(raw.length < 16000, 'درخواست بیش از حد بزرگ است.');
    const body = JSON.parse(raw);
    const now = new Date().toISOString();
    if (body.action === 'save-profile') {
      check(body.consent === true, 'ذخیرهٔ سلیقه به انتخاب خودتان نیاز دارد.');
      check(
        typeof body.displayName === 'string' &&
          body.displayName.trim().length > 0 &&
          body.displayName.length <= 60,
        'نام دلخواه را وارد کنید.',
      );
      check(
        Number.isInteger(body.revision) && body.revision >= 0,
        'نسخهٔ حساب معتبر نیست.',
      );
      const profile: Profile = {
        displayName: body.displayName.trim(),
        preferences: parsePreferences(body.preferences),
        consentAt: now,
        revision: body.revision + 1,
      };
      const result =
        body.revision === 0
          ? await db
              .prepare(
                'INSERT OR IGNORE INTO taste_profiles (owner,revision,data) VALUES (?,1,?)',
              )
              .bind(owner, JSON.stringify(profile))
              .run()
          : await db
              .prepare(
                'UPDATE taste_profiles SET revision=revision+1,data=? WHERE owner=? AND revision=?',
              )
              .bind(JSON.stringify(profile), owner, body.revision)
              .run();
      if (result.meta.changes !== 1)
        return json(
          { error: 'حساب در صفحهٔ دیگری تغییر کرده؛ اطلاعات را تازه کنید.' },
          409,
        );
      return json(await tasteSnapshot(owner));
    }
    if (body.action === 'forget') {
      check(body.confirm === true, 'حذف سلیقه را تأیید کنید.');
      await db.batch([
        db.prepare('DELETE FROM taste_profiles WHERE owner=?').bind(owner),
        db.prepare('DELETE FROM taste_feedback WHERE owner=?').bind(owner),
        db.prepare('DELETE FROM taste_decisions WHERE owner=?').bind(owner),
      ]);
      return json(await tasteSnapshot(owner));
    }
    if (body.action === 'export') {
      const snapshot = await tasteSnapshot(owner);
      check(snapshot.profile, 'ابتدا سلیقهٔ خود را ذخیره کنید.');
      return json(portableProfile(snapshot.profile));
    }
    if (body.action === 'knowledge') {
      // This private presentation deliberately lets its authenticated owner simulate staff roles.
      check(
        body.role === 'manager',
        'ثبت شناسنامه در نمای مدیریت انجام می‌شود.',
      );
      const k = parseKnowledge(body.knowledge, now),
        previousRevision = k.revision;
      k.revision++;
      const result =
        previousRevision === 0
          ? await db
              .prepare(
                'INSERT OR IGNORE INTO dish_knowledge (key,owner,revision,data) VALUES (?,?,1,?)',
              )
              .bind(owner + ':' + k.itemId, owner, JSON.stringify(k))
              .run()
          : await db
              .prepare(
                'UPDATE dish_knowledge SET data=?,revision=revision+1 WHERE key=? AND owner=? AND revision=?',
              )
              .bind(
                JSON.stringify(k),
                owner + ':' + k.itemId,
                owner,
                previousRevision,
              )
              .run();
      if (result.meta.changes !== 1)
        return json(
          { error: 'شناسنامه تغییر کرده؛ اطلاعات را تازه کنید.' },
          409,
        );
      return json(await tasteSnapshot(owner));
    }
    if (body.action === 'recommend') {
      check(
        typeof body.requestId === 'string' &&
          /^[\w-]{16,80}$/.test(body.requestId),
        'شناسهٔ درخواست معتبر نیست.',
      );
      const context = parseContext(body.context);
      check(
        Array.isArray(body.cartIds) &&
          body.cartIds.length <= 50 &&
          body.cartIds.every((id: unknown) => menu.some((m) => m.id === id)),
        'انتخاب فعلی معتبر نیست.',
      );
      const old = await db
        .prepare('SELECT data FROM taste_decisions WHERE key=? AND owner=?')
        .bind(owner + ':' + body.requestId, owner)
        .first<{ data: string }>();
      if (old) return json(JSON.parse(old.data));
      const snapshot = await tasteSnapshot(owner);
      const workspace = await db
        .prepare('SELECT data FROM workspaces WHERE owner=?')
        .bind(owner)
        .first<{ data: string }>();
      const unavailable = workspace
        ? (JSON.parse(workspace.data) as Workspace).unavailable
        : [];
      const decision = recommend(
        context,
        unavailable,
        snapshot.knowledge,
        snapshot.profile ? snapshot.feedback : [],
        body.cartIds,
        body.requestId,
        now,
      );
      const today = now.slice(0, 10);
      const result = await db
        .prepare(
          'INSERT OR IGNORE INTO taste_decisions (key,owner,data,created_at) SELECT ?,?,?,? WHERE (SELECT count(*) FROM taste_decisions WHERE owner=? AND created_at>=?)<500 AND (?=0 OR EXISTS (SELECT 1 FROM taste_profiles WHERE owner=? AND revision=?))',
        )
        .bind(
          owner + ':' + body.requestId,
          owner,
          JSON.stringify(decision),
          now,
          owner,
          today,
          snapshot.profile?.revision || 0,
          owner,
          snapshot.profile?.revision || 0,
        )
        .run();
      if (result.meta.changes !== 1) {
        const concurrent = await db
          .prepare('SELECT data FROM taste_decisions WHERE key=? AND owner=?')
          .bind(owner + ':' + body.requestId, owner)
          .first<{ data: string }>();
        if (concurrent) return json(JSON.parse(concurrent.data));
        if (snapshot.profile) {
          const current = await db
            .prepare('SELECT revision FROM taste_profiles WHERE owner=?')
            .bind(owner)
            .first<{ revision: number }>();
          if (current?.revision !== snapshot.profile.revision)
            return json(
              {
                error:
                  'حافظهٔ سلیقه تغییر کرده یا حذف شده است؛ اطلاعات را تازه کنید.',
              },
              409,
            );
        }
        return json(
          {
            error:
              'سقف درخواست‌های پیشنهاد امروز رسیده است؛ منو و کاپیتان در دسترس‌اند.',
          },
          429,
        );
      }
      return json(decision);
    }
    if (body.action === 'event') {
      check(
        typeof body.decisionId === 'string' &&
          /^[\w-]{16,80}$/.test(body.decisionId),
        'پیشنهاد معتبر نیست.',
      );
      check(
        ['shown', 'selected', 'rejected'].includes(body.event),
        'بازخورد معتبر نیست.',
      );
      const row = await db
        .prepare('SELECT data FROM taste_decisions WHERE key=? AND owner=?')
        .bind(owner + ':' + body.decisionId, owner)
        .first<{ data: string }>();
      check(row, 'پیشنهاد پیدا نشد.');
      const decision = JSON.parse(row.data) as Decision;
      check(
        decision.selected.includes(body.itemId),
        'این گزینه در پیشنهاد نمایش داده نشده است.',
      );
      const eventKey = body.itemId + '_' + body.event;
      const recorded = await db
        .prepare(
          'UPDATE taste_decisions SET data=json_set(data,?,?) WHERE key=? AND owner=?',
        )
        .bind('$.events.' + eventKey, now, owner + ':' + body.decisionId, owner)
        .run();
      check(recorded.meta.changes === 1, 'سابقهٔ پیشنهاد حذف شده است.');
      return json({ saved: true });
    }
    if (body.action === 'feedback') {
      check(
        body.mine === true,
        'این بازخورد فقط برای غذایی است که خودتان میل کرده‌اید.',
      );
      check(
        typeof body.orderItemId === 'string' &&
          ['like', 'dislike', 'service'].includes(body.rating),
        'بازخورد معتبر نیست.',
      );
      const row = await db
        .prepare('SELECT data FROM workspaces WHERE owner=?')
        .bind(owner)
        .first<{ data: string }>();
      const item =
        row &&
        (JSON.parse(row.data) as Workspace).visits
          .flatMap((v) => v.items)
          .find((i) => i.id === body.orderItemId && i.status === 'served');
      check(item, 'بازخورد طعم فقط پس از ثبت سرو غذا در دسترس است.');
      const feedback = {
        orderItemId: item.id,
        menuId: item.menuId,
        rating: body.rating,
        at: now,
      };
      const result = await db
        .prepare(
          'INSERT INTO taste_feedback (key,owner,data) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM taste_profiles WHERE owner=?) ON CONFLICT(key) DO UPDATE SET data=excluded.data',
        )
        .bind(owner + ':' + item.id, owner, JSON.stringify(feedback), owner)
        .run();
      check(
        result.meta.changes === 1,
        'برای یادآوری بازخورد در مراجعات بعد، ابتدا سلیقه را در حسابتان ذخیره کنید.',
      );
      return json(await tasteSnapshot(owner));
    }
    throw new Error('عملیات معتبر نیست.');
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : 'ذخیره انجام نشد.' },
      400,
    );
  }
}
