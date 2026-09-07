import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
const commands = [
  [
    '--test',
    ...readdirSync('tests')
      .filter((name) => name.endsWith('.test.mjs'))
      .map((name) => 'tests/' + name),
  ],
  ['node_modules/oxlint/bin/oxlint'],
  ['node_modules/typescript/bin/tsc', '--noEmit'],
  ['scripts/build-node.mjs'],
  ['tests/node-server.mjs'],
];
for (const command of commands) {
  const result = spawnSync(process.execPath, command, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
