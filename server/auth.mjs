import { createHash, timingSafeEqual } from 'node:crypto';
export function isAuthorized(header, username, password) {
  if (
    !username ||
    !password ||
    password.length < 20 ||
    !header?.startsWith('Basic ')
  )
    return false;
  const given = Buffer.from(header.slice(6), 'base64');
  const expected = Buffer.from(`${username}:${password}`);
  const hash = (value) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(given), hash(expected));
}
