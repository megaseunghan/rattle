/** 런타임 어댑터는 원본 32바이트 HMAC-SHA256을 반환해야 한다. Node crypto는 테스트에서만 쓴다. */
export type AttendanceHmacSha256 = (key: Uint8Array, message: Uint8Array) => Uint8Array;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(`^${UUID}$`);
const QR_RE = new RegExp(`^rattle-punch:v1\\.(${UUID})\\.([0-9a-f]{24})\\.([0-9a-f]{32})$`);
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeSecret(secret: string): Uint8Array {
  // 32바이트의 canonical base64는 정확히 44자이고 마지막 유효 문자의 하위 2비트는 0이다.
  if (!/^[A-Za-z0-9+/]{43}=$/.test(secret) || secret.length !== 44 || (BASE64.indexOf(secret[42]) & 3) !== 0) {
    throw new Error('ATTENDANCE_INPUT_INVALID');
  }
  const bytes = new Uint8Array(32);
  let bits = 0;
  let accumulator = 0;
  let index = 0;
  for (const char of secret.slice(0, -1)) {
    accumulator = (accumulator << 6) | BASE64.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[index++] = (accumulator >>> bits) & 255;
    }
  }
  return bytes;
}
export function parseAttendanceQr(qr: string): { deviceId: string; nonce: string; sig: string } | null {
  const match = QR_RE.exec(qr);
  // JS의 $는 마지막 개행 앞도 일치하므로 전체 일치 길이를 확인한다.
  return match && match[0].length === qr.length ? { deviceId: match[1], nonce: match[2], sig: match[3] } : null;
}
export function createAttendanceQr(
  input: { secret: string; deviceId: string; nonce: string },
  hmacSha256: AttendanceHmacSha256,
): string {
  const { secret, deviceId, nonce } = input;
  if (!UUID_RE.test(deviceId) || deviceId.length !== 36 || !/^[0-9a-f]{24}$/.test(nonce) || nonce.length !== 24) {
    throw new Error('ATTENDANCE_INPUT_INVALID');
  }
  const key = decodeSecret(secret);
  // 허용 입력은 ASCII의 부분집합이어서 각 charCode가 UTF-8 바이트와 같다.
  const message = Uint8Array.from(`${deviceId}.${nonce}`, char => char.charCodeAt(0));
  try {
    const digest = hmacSha256(key, message);
    if (!(digest instanceof Uint8Array) || digest.length !== 32) throw new Error('ATTENDANCE_HMAC_INVALID');
    const sig = Array.from(digest.slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
    return `rattle-punch:v1.${deviceId}.${nonce}.${sig}`;
  } catch {
    throw new Error('ATTENDANCE_HMAC_INVALID');
  } finally {
    key.fill(0);
  }
}
