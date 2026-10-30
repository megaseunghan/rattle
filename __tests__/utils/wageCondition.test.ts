import { isWageDate, wageAmount } from '../../lib/utils/wageCondition';
it.each(['', '2026-02-30', '2026-13-01', '2026-2-01', 'unknown'])('유효하지 않은 적용일 %s를 거절한다', value => expect(isWageDate(value)).toBe(false));
it('윤년 실제 날짜를 검증한다', () => { expect(isWageDate('2024-02-29')).toBe(true); expect(isWageDate('2026-02-29')).toBe(false); });
it.each(['', '-1', '1.1', 'NaN', '9007199254740992'])('미입력·소수·안전하지 않은 금액 %s를 거절한다', value => expect(wageAmount(value)).toBeNull());
it('명시적 0과 정상 금액을 보존한다', () => { expect(wageAmount('0')).toBe(0); expect(wageAmount('3,000,000')).toBe(3000000); });
