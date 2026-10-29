import { AppleUnlinkError, createAppleClientSecret, revokeAppleAuthorization } from './appleUnlink.ts';

async function config() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pem = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey))));
  return { clientId: 'com.seunghan.rattle', teamId: 'fixture-team', keyId: 'fixture-key', privateKey: pem, publicKey: keys.publicKey };
}
function token(subject = 'apple-user', aud = 'com.seunghan.rattle') {
  return `header.${btoa(JSON.stringify({ sub: subject, aud, iss: 'https://appleid.apple.com', exp: Math.floor(Date.now() / 1000) + 300 }))}.signature`;
}
async function expectCode(run: () => Promise<unknown>, expected: string) {
  try { await run(); } catch (error) {
    if (error instanceof AppleUnlinkError && error.code === expected) return;
    throw error;
  }
  throw new Error('expected Apple error');
}
function mockFetch(responses: Response[]) {
  const original = globalThis.fetch;
  const calls: { url: string; body: URLSearchParams }[] = [];
  globalThis.fetch = (input, init) => {
    calls.push({ url: String(input), body: init?.body as URLSearchParams });
    return Promise.resolve(responses.shift() ?? Response.json({}, { status: 500 }));
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}
Deno.test('Apple client secret은 실제 ES256 서명이고 5분 안에 만료된다', async () => {
  const fixture = await config();
  const jwt = await createAppleClientSecret(fixture);
  const [header, payload, signature] = jwt.split('.');
  const claims = JSON.parse(atob(payload));
  if (claims.sub !== fixture.clientId || claims.exp - claims.iat !== 300) throw new Error('invalid client claims');
  const padded = signature.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(signature.length / 4) * 4, '=');
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, fixture.publicKey,
    Uint8Array.from(atob(padded), ch => ch.charCodeAt(0)), new TextEncoder().encode(`${header}.${payload}`));
  if (!valid) throw new Error('invalid signature');
});
Deno.test('본인 Apple 인증 코드를 교환한 뒤 발급된 refresh token만 해제한다', async () => {
  const fixture = await config();
  const mock = mockFetch([Response.json({ id_token: token(), refresh_token: 'fixture-refresh' }), new Response(null, { status: 200 })]);
  try {
    await revokeAppleAuthorization('apple-user', 'fresh-code', fixture);
    if (mock.calls.length !== 2 || mock.calls[0].body.get('code') !== 'fresh-code' ||
        mock.calls[1].body.get('token') !== 'fixture-refresh' || mock.calls[1].url !== 'https://appleid.apple.com/auth/revoke') throw new Error('unexpected revocation');
  } finally { mock.restore(); }
});
Deno.test('타인의 Apple 코드로 연결을 해제하지 않는다', async () => {
  const fixture = await config();
  const mock = mockFetch([Response.json({ id_token: token('other-user'), refresh_token: 'other-refresh' })]);
  try {
    await expectCode(() => revokeAppleAuthorization('apple-user', 'code', fixture), 'APPLE_ACCOUNT_MISMATCH');
    if (mock.calls.length !== 1) throw new Error('foreign token revoked');
  } finally { mock.restore(); }
});
Deno.test('다른 앱용 Apple 토큰도 거절한다', async () => {
  const fixture = await config();
  const mock = mockFetch([Response.json({ id_token: token('apple-user', 'foreign.app'), refresh_token: 'refresh' })]);
  try { await expectCode(() => revokeAppleAuthorization('apple-user', 'code', fixture), 'APPLE_ACCOUNT_MISMATCH'); }
  finally { mock.restore(); }
});
Deno.test('인증 코드 누락은 외부 호출 전에 거절한다', async () => {
  const fixture = await config();
  const mock = mockFetch([]);
  try {
    await expectCode(() => revokeAppleAuthorization('apple-user', undefined, fixture), 'APPLE_REAUTH_REQUIRED');
    if (mock.calls.length) throw new Error('unexpected request');
  } finally { mock.restore(); }
});
Deno.test('Apple 교환·해제 오류는 내부 응답을 노출하지 않는다', async () => {
  const fixture = await config();
  for (const responses of [
    [Response.json({ error: 'private details' }, { status: 400 })],
    [Response.json({ id_token: token(), refresh_token: 'refresh' }), Response.json({ error: 'private details' }, { status: 503 })],
  ]) {
    const mock = mockFetch(responses);
    try { await expectCode(() => revokeAppleAuthorization('apple-user', 'code', fixture), 'APPLE_UNLINK_FAILED'); }
    finally { mock.restore(); }
  }
});
