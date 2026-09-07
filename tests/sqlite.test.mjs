import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openDatabase,
  applyMigrations,
  d1Adapter,
  backupDatabase,
  migrationManifest,
} from '../server/sqlite.mjs';

void test('SQLite preserves atomic batches, revisions, RETURNING values and online backups', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'moya-sqlite-'));
  const db = openDatabase(join(dir, 'live.sqlite'));
  try {
    applyMigrations(db);
    const adapter = d1Adapter(db);
    await adapter
      .prepare('INSERT INTO ai_usage(bucket,count) VALUES (?,?)')
      .bind('test', 1)
      .run();
    const updated = await adapter
      .prepare(
        'UPDATE ai_usage SET count=count+1 WHERE bucket=? RETURNING count',
      )
      .bind('test')
      .first();
    assert.equal(updated.count, 2);
    const result = await adapter
      .prepare('UPDATE ai_usage SET count=3 WHERE bucket=? AND count=2')
      .bind('test')
      .run();
    assert.equal(result.meta.changes, 1);
    await assert.rejects(
      adapter.batch([
        adapter
          .prepare('UPDATE ai_usage SET count=4 WHERE bucket=?')
          .bind('test'),
        adapter
          .prepare('INSERT INTO ai_usage(bucket,count) VALUES (?,?)')
          .bind('test', 5),
      ]),
    );
    assert.equal(
      (
        await adapter
          .prepare('SELECT count FROM ai_usage WHERE bucket=?')
          .bind('test')
          .first()
      ).count,
      3,
    );
    await backupDatabase(join(dir, 'live.sqlite'), join(dir, 'copy.sqlite'));
    const copy = openDatabase(join(dir, 'copy.sqlite'));
    try {
      assert.equal(
        copy.prepare('SELECT count FROM ai_usage WHERE bucket=?').get('test')
          .count,
        3,
      );
    } finally {
      copy.close();
    }
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

void test('Migration failures leave schema unchanged; release manifests detect missing files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'moya-migrations-'));
  const migrations = join(dir, 'migrations');
  mkdirSync(migrations);
  const db = openDatabase(join(dir, 'test.sqlite'));
  try {
    writeFileSync(
      join(migrations, '0000.sql'),
      'CREATE TABLE initial (id TEXT PRIMARY KEY);',
    );
    const initial = migrationManifest(migrations);
    applyMigrations(db, migrations, initial);
    writeFileSync(
      join(migrations, '0001.sql'),
      'CREATE TABLE second (id TEXT); CREATE INDEX bad ON nonexistent(id);',
    );
    assert.throws(() => applyMigrations(db, migrations));
    assert.equal(
      db.prepare("SELECT name FROM sqlite_master WHERE name='second'").get(),
      undefined,
    );
    writeFileSync(join(migrations, '0001.sql'), 'DROP TABLE initial;');
    assert.throws(() => applyMigrations(db, migrations), /not safe/);
    writeFileSync(
      join(migrations, '0001.sql'),
      'CREATE TABLE second (id TEXT);',
    );
    const newer = migrationManifest(migrations);
    applyMigrations(db, migrations, newer);
    rmSync(join(migrations, '0001.sql'));
    assert.throws(() => applyMigrations(db, migrations, newer), /incomplete/);
    // A complete old image can restart against newer additive schema after code rollback.
    assert.doesNotThrow(() => applyMigrations(db, migrations, initial));
    writeFileSync(
      join(migrations, '0001.sql'),
      'CREATE TABLE second (id TEXT);',
    );
    writeFileSync(
      join(migrations, '0000.sql'),
      'CREATE TABLE initial (id INTEGER PRIMARY KEY);',
    );
    assert.throws(() => applyMigrations(db, migrations), /changed/);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
