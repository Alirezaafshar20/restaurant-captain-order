import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

export function openDatabase(filename) {
  if (!filename) throw new Error('DATABASE_PATH is required');
  mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new DatabaseSync(filename);
  sqlite.exec(
    'PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;',
  );
  return sqlite;
}

export function migrationManifest(directory = 'drizzle') {
  return Object.fromEntries(
    readdirSync(directory)
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .map((name) => [
        name,
        createHash('sha256')
          .update(
            readFileSync(join(directory, name), 'utf8').replaceAll(
              '\r\n',
              '\n',
            ),
          )
          .digest('hex'),
      ]),
  );
}

export function applyMigrations(sqlite, directory = 'drizzle', manifest) {
  const actual = migrationManifest(directory);
  if (manifest && JSON.stringify(actual) !== JSON.stringify(manifest))
    throw new Error('Release migration files are incomplete or modified');
  sqlite.exec(
    'CREATE TABLE IF NOT EXISTS moya_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)',
  );
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const applied = sqlite
    .prepare('SELECT name, checksum FROM moya_migrations ORDER BY name')
    .all();
  for (const row of applied)
    if (!files.includes(row.name) && !(manifest && row.name > files.at(-1)))
      throw new Error(`Applied migration missing: ${row.name}`);
  const pending = [];
  for (const name of files) {
    const sql = readFileSync(join(directory, name), 'utf8');
    const checksum = createHash('sha256')
      .update(sql.replaceAll('\r\n', '\n'))
      .digest('hex');
    const prior = applied.find((row) => row.name === name);
    if (prior && prior.checksum !== checksum)
      throw new Error(`Applied migration changed: ${name}`);
    if (!prior) {
      // Automatic deployments accept only additive CREATE statements. Data rewrites,
      // ALTER/DROP and arbitrary PRAGMAs require a separately reviewed migration.
      const statements = sql
        .replace(/--[^\n]*/g, '')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      if (
        !statements.length ||
        statements.some(
          (s) => !/^CREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX)\s+/i.test(s),
        )
      )
        throw new Error(
          `Migration is not safe for automatic rollback: ${name}`,
        );
      if (applied.length && name <= applied.at(-1).name)
        throw new Error(`Out-of-order migration: ${name}`);
      pending.push({ name, sql, checksum });
    }
  }
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    for (const migration of pending) {
      sqlite.exec(migration.sql);
      sqlite
        .prepare('INSERT INTO moya_migrations(name,checksum) VALUES (?,?)')
        .run(migration.name, migration.checksum);
    }
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
  return files.length;
}

export function d1Adapter(sqlite) {
  const execute = (sql, values) => {
    const statement = sqlite.prepare(sql);
    const rows = statement.columns().length ? statement.all(...values) : [];
    const info = statement.columns().length
      ? { changes: 0 }
      : statement.run(...values);
    return {
      success: true,
      results: rows,
      meta: { changes: Number(info.changes) },
    };
  };
  const prepare = (sql, values = []) => ({
    bind: (...args) => prepare(sql, args),
    first: async (column) => {
      const row = sqlite.prepare(sql).get(...values);
      return column ? (row?.[column] ?? null) : (row ?? null);
    },
    all: async () => execute(sql, values),
    run: async () => execute(sql, values),
    _execute: () => execute(sql, values),
  });
  return {
    prepare,
    batch: async (statements) => {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map((s) => s._execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

export async function backupDatabase(source, target) {
  mkdirSync(dirname(target), { recursive: true });
  const sqlite = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(sqlite, target);
  } finally {
    sqlite.close();
  }
}
