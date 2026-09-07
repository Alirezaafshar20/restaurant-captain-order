import { execFileSync, spawnSync } from 'node:child_process';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const clean = () => {
  if (git('status', '--porcelain', '--untracked-files=all'))
    throw new Error(
      'Commit all intended changes first. The repository must be clean, including untracked files.',
    );
};
clean();
const sha = git('rev-parse', 'HEAD');
const branch = git('branch', '--show-current');
if (branch !== 'main')
  throw new Error(
    'Switch to main and review/merge the intended changes before publishing.',
  );
const remote = git('remote', 'get-url', 'github');
if (
  remote !== 'https://github.com/Alirezaafshar20/moya-captain-order.git' &&
  remote !== 'git@github.com:Alirezaafshar20/moya-captain-order.git'
)
  throw new Error('Unexpected github remote; inspect it before pushing.');
const check = spawnSync(process.execPath, ['scripts/check-release.mjs'], {
  stdio: 'inherit',
});
if (check.status !== 0) process.exit(check.status || 1);
clean();
if (git('rev-parse', 'HEAD') !== sha)
  throw new Error('The commit changed while checking. Run again.');
const pushed = spawnSync('git', ['push', 'github', `${sha}:refs/heads/main`], {
  stdio: 'inherit',
});
if (pushed.status !== 0) process.exit(pushed.status || 1);
const remoteSha = git(
  'ls-remote',
  '--exit-code',
  'github',
  'refs/heads/main',
).split(/\s+/)[0];
if (remoteSha !== sha)
  throw new Error(
    'Remote revision changed or could not be verified. Do not deploy yet.',
  );
console.log(
  `Verified GitHub commit: ${sha}\nOn the server: sudo bash deploy.sh --expect-sha ${sha}`,
);
