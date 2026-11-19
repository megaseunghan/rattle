const { createHmac } = jest.requireActual('node:crypto');
import { createAttendanceQr, parseAttendanceQr } from '../../lib/utils/attendanceQr';

const secret = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
const deviceId = '00000000-0000-0000-0000-000000000043';
const nonce = '000102030405060708090a0b';
const sig = '5c311dc26b6bd8664aa4845ac2972909';
const hmac = (key: Uint8Array, message: Uint8Array) => new Uint8Array(createHmac('sha256', key).update(message).digest());

it('서버 고정 벡터와 같은 QR을 만든다', () => {
  expect(createAttendanceQr({ secret, deviceId, nonce }, hmac)).toBe(`rattle-punch:v1.${deviceId}.${nonce}.${sig}`);
});
it('base64 문자가 아닌 디코드한 32바이트를 키로 전달한다', () => {
  let observed: number[] = [];
  const adapter = jest.fn((key: Uint8Array, message: Uint8Array) => { observed = Array.from(key); return hmac(key, message); });
  createAttendanceQr({ secret, deviceId, nonce }, adapter);
  expect(observed).toEqual(Array.from({ length: 32 }, (_, i) => i));
  const wrong = createHmac('sha256', secret).update(`${deviceId}.${nonce}`).digest('hex').slice(0, 32);
  expect(wrong).not.toBe(sig);
});
it.each([
  { deviceId: 'AAAAAAAA-0000-0000-0000-000000000043' },
  { nonce: '000102030405060708090A0B' },
  { nonce: nonce.slice(1) },
  { nonce: `${nonce}0` },
  { secret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==' },
  { secret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
  { secret: `${secret}\n` },
  { secret: `${secret.slice(0, -2)}9=` },
])('잘못된 형식을 묵시 보정 없이 거절한다: %j', overrides => {
  const adapter = jest.fn(hmac);
  expect(() => createAttendanceQr({ secret, deviceId, nonce, ...overrides }, adapter)).toThrow('ATTENDANCE_INPUT_INVALID');
  expect(adapter).not.toHaveBeenCalled();
});
it('주입 어댑터의 잘못된 다이제스트를 거절한다', () => {
  expect(() => createAttendanceQr({ secret, deviceId, nonce }, () => new Uint8Array(16))).toThrow('ATTENDANCE_HMAC_INVALID');
});
it('엄격한 소문자 QR만 파싱한다', () => {
  expect(parseAttendanceQr(`rattle-punch:v1.${deviceId}.${nonce}.${sig}`)).toEqual({ deviceId, nonce, sig });
  expect(parseAttendanceQr(`rattle-punch:v1.${deviceId}.${nonce}.${sig.toUpperCase()}`)).toBeNull();
  expect(parseAttendanceQr(`rattle-punch:v1.${deviceId}.${nonce}.${sig}\n`)).toBeNull();
});
it('HMAC 어댑터가 던진 내부 오류를 코드로만 내보낸다', () => {
  expect(() => createAttendanceQr({ secret, deviceId, nonce }, () => { throw new Error('private-secret'); }))
    .toThrow('ATTENDANCE_HMAC_INVALID');
});
