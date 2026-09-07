import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { migrationManifest } from '../server/sqlite.mjs';
const result = spawnSync(
  process.execPath,
  ['node_modules/vinext/dist/cli.js', 'build'],
  { stdio: 'inherit', env: { ...process.env, MOYA_BUILD_TARGET: 'node' } },
);
if (result.status === 0)
  writeFileSync('dist/migrations.json', JSON.stringify(migrationManifest()));
process.exit(result.status ?? 1);
