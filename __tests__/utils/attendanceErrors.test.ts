import { ATTENDANCE_ERROR_CATEGORIES, classifyAttendanceError, isAttendanceErrorCode } from '../../lib/utils/attendanceErrors';

it.each(Object.keys(ATTENDANCE_ERROR_CATEGORIES))('알려진 오류 %s를 분류한다', code => {
  expect(isAttendanceErrorCode(code)).toBe(true);
  expect(classifyAttendanceError({ message: code })).toMatchObject({ code, category: ATTENDANCE_ERROR_CATEGORIES[code as keyof typeof ATTENDANCE_ERROR_CATEGORIES] });
});
it('새 ATTENDANCE 코드는 원문 없이 일반 서버 거절로 분류한다', () => {
  expect(classifyAttendanceError({ message: 'ATTENDANCE_FUTURE_REJECTION' })).toEqual({ code: 'ATTENDANCE_SERVER_REJECTED', category: 'server' });
});
it('원문·상세·힌트와 비밀 문자열을 반환하지 않는다', () => {
  expect(classifyAttendanceError({ code: 'P0001', message: 'private secret', details: 'token' })).toEqual({ code: 'ATTENDANCE_UNKNOWN', category: 'unknown' });
  expect(isAttendanceErrorCode('ATTENDANCE_FUTURE_REJECTION')).toBe(false);
});

it.each([['ATTENDANCE_OWNER_REQUIRED','permission'], ['ATTENDANCE_ORDER_INVALID','input']])('새 정책 오류 %s를 구분한다', (code, category) => {
  expect(classifyAttendanceError({message: code})).toEqual({code, category});
});
