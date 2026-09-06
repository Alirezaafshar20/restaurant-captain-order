import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const files = readdirSync(root).filter(
  (f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite',
);
if (files.length !== 1)
  throw new Error(
    'Start the local server and request /api/workspace first; expected one project database.',
  );
const db = new DatabaseSync(join(root, files[0]));
db.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
for (const f of readdirSync('drizzle')
  .filter((f) => f.endsWith('.sql'))
  .sort()) {
  if (db.prepare('SELECT name FROM local_migrations WHERE name=?').get(f))
    continue;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(readFileSync(join('drizzle', f), 'utf8'));
    db.prepare('INSERT INTO local_migrations (name) VALUES (?)').run(f);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
db.close();
console.log('Local database migrations applied.');
