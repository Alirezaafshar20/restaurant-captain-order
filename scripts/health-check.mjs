import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const origin = 'http://127.0.0.1:' + (process.env.PORT || '3000');
const authorization =
  'Basic ' +
  Buffer.from(
    `${process.env.MOYA_ADMIN_USER}:${process.env.MOYA_ADMIN_PASSWORD}`,
  ).toString('base64');
const request = async (path) => {
  const response = await fetch(origin + path, {
    headers: { Authorization: authorization },
    signal: AbortSignal.timeout(6000),
  });
  assert.equal(response.status, 200, `${path} did not return 200`);
  return response;
};
const status = await (await request('/healthz')).json();
assert.equal(status.ok, true);
assert.equal(status.release, process.env.RELEASE_SHA || 'local');
const catalog = JSON.parse(readFileSync('data/menu-catalog.json', 'utf8'));
assert.equal(status.menuItems, catalog.items.length);
if (process.argv.includes('--full')) {
  const unauthorized = await fetch(origin + '/api/workspace', {
    signal: AbortSignal.timeout(6000),
  });
  assert.equal(unauthorized.status, 401);
  const html = await (await request('/')).text();
  assert.match(html, /مویا/);
  const workspace = await (await request('/api/workspace')).json();
  assert.equal(typeof workspace.revision, 'number');
  await request('/api/taste');
  await request('/api/voice');
  const photo = catalog.items.find((item) => item.image)?.image;
  assert.ok(photo);
  const image = await request(photo);
  assert.match(image.headers.get('content-type') || '', /^image\//);
  assert.ok((await image.arrayBuffer()).byteLength > 100);
}
console.log('MOYA health check passed: ' + status.release);
