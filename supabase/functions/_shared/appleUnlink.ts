interface AppleConfig {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}

export class AppleUnlinkError extends Error {
  constructor(public code: 'APPLE_REAUTH_REQUIRED' | 'APPLE_ACCOUNT_MISMATCH' | 'APPLE_UNLINK_FAILED') {
    super(code);
  }
}

function base64url(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
const encode = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));

/** 서버에서 짧은 수명의 client secret을 생성한다. p8과 발급 토큰은 DB·로그에 저장하지 않는다. */
export async function createAppleClientSecret(config: AppleConfig): Promise<string> {
  if (!config.clientId || !config.teamId || !config.keyId || !config.privateKey) throw new AppleUnlinkError('APPLE_UNLINK_FAILED');
  const pem = config.privateKey.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), ch => ch.charCodeAt(0)),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'ES256', kid: config.keyId })}.${encode({ iss: config.teamId, iat: now, exp: now + 300, aud: 'https://appleid.apple.com', sub: config.clientId })}`;
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

/** Apple token endpoint에서 직접 받은 id_token만 읽는다. 클라이언트가 보낸 JWT를 신뢰하지 않는다. */
function readAppleSubject(idToken: string, clientId: string): string {
  const part = idToken.split('.')[1];
  const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  const payload = JSON.parse(atob(padded));
  if (payload.iss !== 'https://appleid.apple.com' || payload.aud !== clientId ||
      typeof payload.exp !== 'number' || payload.exp <= Date.now() / 1000 || typeof payload.sub !== 'string' || !payload.sub) {
    throw new AppleUnlinkError('APPLE_ACCOUNT_MISMATCH');
  }
  return payload.sub;
}

export async function revokeAppleAuthorization(subject: string, code: string | undefined, config: AppleConfig): Promise<void> {
  if (!code || code.length > 4096) throw new AppleUnlinkError('APPLE_REAUTH_REQUIRED');
  try {
    const secret = await createAppleClientSecret(config);
    const exchange = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: secret, code, grant_type: 'authorization_code' }),
    });
    if (!exchange.ok) throw new AppleUnlinkError('APPLE_UNLINK_FAILED');
    const tokens = await exchange.json();
    if (typeof tokens.id_token !== 'string' || typeof tokens.refresh_token !== 'string' || !tokens.refresh_token) {
      throw new AppleUnlinkError('APPLE_UNLINK_FAILED');
    }
    if (readAppleSubject(tokens.id_token, config.clientId) !== subject) throw new AppleUnlinkError('APPLE_ACCOUNT_MISMATCH');
    const revoked = await fetch('https://appleid.apple.com/auth/revoke', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: secret, token: tokens.refresh_token, token_type_hint: 'refresh_token' }),
    });
    if (!revoked.ok) throw new AppleUnlinkError('APPLE_UNLINK_FAILED');
  } catch (error) {
    if (error instanceof AppleUnlinkError) throw error;
    throw new AppleUnlinkError('APPLE_UNLINK_FAILED');
  }
}
