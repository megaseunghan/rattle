import { defaultAttendanceHmacSha256 } from '../../lib/utils/attendanceHmac';
import { createAttendanceQr } from '../../lib/utils/attendanceQr';

it('noble 기본 어댑터도 서버 고정 벡터와 같은 서명을 만든다', () => {
  const qr = createAttendanceQr({
    // Deterministic test vector: bytes 0x00..0x1f (not a real credential).
    secret: Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString('base64'),
    deviceId: '00000000-0000-0000-0000-000000000043',
    nonce: '000102030405060708090a0b',
  }, defaultAttendanceHmacSha256);
  expect(qr).toBe('rattle-punch:v1.00000000-0000-0000-0000-000000000043.000102030405060708090a0b.5c311dc26b6bd8664aa4845ac2972909');
});
it('원본 키와 메시지를 변경하지 않고 32바이트를 반환한다', () => {
  const key = Uint8Array.from({ length: 32 }, (_, i) => i);
  const message = new Uint8Array([1, 2, 3]);
  const beforeKey = key.slice(); const beforeMessage = message.slice();
  const digest = defaultAttendanceHmacSha256(key, message);
  expect(digest).toBeInstanceOf(Uint8Array);
  expect(digest.length).toBe(32);
  expect(key).toEqual(beforeKey);
  expect(message).toEqual(beforeMessage);
});
