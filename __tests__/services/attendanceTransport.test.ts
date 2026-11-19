import { executeAttendance } from '../../lib/services/attendanceTransport';

it('요청 전에 취소된 경우 전송하지 않는다', async () => {
  const controller = new AbortController(); controller.abort();
  const request = jest.fn();
  expect(await executeAttendance(request, { signal: controller.signal })).toMatchObject({ status: 'preflight_failed', error: { code: 'ATTENDANCE_ABORTED' } });
  expect(request).not.toHaveBeenCalled();
});
it.each([0, -1, NaN, Infinity])('잘못된 timeout %s는 요청 전에 거절한다', async timeoutMs => {
  const request = jest.fn();
  expect(await executeAttendance(request, { timeoutMs })).toMatchObject({ status: 'preflight_failed' });
  expect(request).not.toHaveBeenCalled();
});
it('요청 시작 후 취소는 결과불명이고 실제 builder에 취소 신호를 전달한다', async () => {
  const controller = new AbortController();
  const pending = new Promise<{ data: unknown; error: unknown }>(() => {});
  const abortSignal = jest.fn((_signal: AbortSignal) => pending);
  const result = executeAttendance(() => Object.assign(pending, { abortSignal }), { signal: controller.signal });
  controller.abort();
  expect(await result).toMatchObject({ status: 'unknown', error: { code: 'ATTENDANCE_ABORTED' } });
  expect(abortSignal.mock.calls[0][0].aborted).toBe(true);
});
it('SQL 권한 거절도 원문 없이 서버 거절로 반환한다', async () => {
  expect(await executeAttendance(() => Promise.resolve({ data: null, error: { code: '42501', message: 'private table' } })))
    .toEqual({ status: 'server_rejected', error: { code: 'ATTENDANCE_SERVER_REJECTED', category: 'server' } });
});
it('PostgREST의 fetch 예외 응답(code 빈 문자열)은 결과불명이다', async () => {
  expect(await executeAttendance(() => Promise.resolve({ data: null, error: { code: '', message: 'TypeError: Failed to fetch' } })))
    .toMatchObject({ status: 'unknown' });
});
it('새 역할의 사장 전용 거절 코드를 원문 없이 보존한다', async () => {
  const result = await executeAttendance(() => Promise.resolve({ data: null, error: { code: '42501', message: 'STORE_OWNER_REQUIRED', details: 'SECRET' } }));
  expect(result).toEqual({ status: 'server_rejected', error: { code: 'STORE_OWNER_REQUIRED', category: 'permission' } });
});
