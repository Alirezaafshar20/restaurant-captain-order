import { database } from './db';
import type { Profile, Knowledge, Feedback, Decision } from './taste';
export async function tasteSnapshot(owner: string) {
  const db = database();
  const results = await db.batch([
    db.prepare('SELECT data FROM taste_profiles WHERE owner=?').bind(owner),
    db.prepare('SELECT data FROM dish_knowledge WHERE owner=?').bind(owner),
    db.prepare('SELECT data FROM taste_feedback WHERE owner=?').bind(owner),
    db
      .prepare(
        'SELECT data FROM taste_decisions WHERE owner=? ORDER BY created_at DESC LIMIT 20',
      )
      .bind(owner),
  ]);
  const data = <T>(i: number) =>
    results[i].results.map(
      (row) => JSON.parse((row as { data: string }).data) as T,
    );
  return {
    profile: data<Profile>(0)[0] || null,
    knowledge: data<Knowledge>(1),
    feedback: data<Feedback>(2),
    decisions: data<Decision>(3),
  };
}
