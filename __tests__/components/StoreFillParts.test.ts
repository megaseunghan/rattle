jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({}) }));
import { closeDayPatch, payDayPatch } from '../../lib/components/store-fill/PaydaySheets';
import { averageDailyHeadcount, headcountWindow } from '../../lib/components/store-fill/headcountReference';
import { formatBusinessNumber, isBusinessNumberInputValid, pickTip } from '../../lib/components/store-fill/storeFillCopy';
import type { StoreFillValues } from '../../lib/utils/storeFill';

const EMPTY: StoreFillValues = {
  payroll_close_day: null, payday_month_offset: null, payday_day: null, payday_holiday_rule: null,
  headcount_class: null, business_entity_type: null, vat_type: null, business_number: null,
  social_insurance_enrolled: null, industrial_accident_industry: null,
};

describe('급여 날짜 저장값', () => {
  test('마감일만 고르면 마감일만 저장한다', () => {
    expect(closeDayPatch(EMPTY, 15)).toEqual({ payroll_close_day: 15 });
  });
  test('같은 달 지급인데 새 마감일로 안 맞으면 다음 달로 함께 고친다', () => {
    const values = { ...EMPTY, payroll_close_day: 10, payday_day: 25, payday_month_offset: 0 as const };
    expect(closeDayPatch(values, 25)).toEqual({ payroll_close_day: 25, payday_month_offset: 1 });
    expect(closeDayPatch(values, 20)).toEqual({ payroll_close_day: 20 });
  });
  test('지급일 첫 저장 때 쉬는 날 규칙을 앞당겨서로 채운다', () => {
    const values = { ...EMPTY, payroll_close_day: 0 };
    expect(payDayPatch(values, 10, 0)).toEqual({ payday_day: 10, payday_month_offset: 1, payday_holiday_rule: 'before' });
  });
  test('이미 정한 쉬는 날 규칙은 건드리지 않는다', () => {
    const values = { ...EMPTY, payroll_close_day: 15, payday_holiday_rule: 'after' as const };
    expect(payDayPatch(values, 25, 0)).toEqual({ payday_day: 25, payday_month_offset: 0 });
  });
});

describe('직원 수 참고 숫자', () => {
  test('기록이 있는 날의 (직원, 날짜) 평균', () => {
    const rows = [
      { employee_id: 'a', work_date: '2026-11-01' }, { employee_id: 'a', work_date: '2026-11-01' },
      { employee_id: 'b', work_date: '2026-11-01' }, { employee_id: 'a', work_date: '2026-11-02' },
      { employee_id: 'b', work_date: '2026-11-03' }, { employee_id: 'c', work_date: '2026-11-03' },
    ];
    expect(averageDailyHeadcount(rows)).toBe(1.7);
  });
  test('기록이 없으면 null', () => {
    expect(averageDailyHeadcount([])).toBeNull();
  });
  test('오늘 포함 30일', () => {
    expect(headcountWindow('2026-11-28')).toEqual({ fromDate: '2026-10-30', toDate: '2026-11-28' });
  });
});

describe('사업자번호 입력', () => {
  test('000-00-00000 형식', () => {
    expect(formatBusinessNumber('1234567890')).toBe('123-45-67890');
    expect(formatBusinessNumber('1234')).toBe('123-4');
    expect(formatBusinessNumber('12a3-4567890999')).toBe('123-45-67890');
  });
  test('비우거나 10자리만 저장할 수 있다', () => {
    expect(isBusinessNumberInputValid('')).toBe(true);
    expect(isBusinessNumberInputValid('123-45-67890')).toBe(true);
    expect(isBusinessNumberInputValid('123-45')).toBe(false);
  });
});

test('안 채운 묶음에서만 설명을 고른다', () => {
  expect(pickTip([])).toBeNull();
  expect(pickTip(['headcount', 'insurance'], () => 0.99)).toBe('insurance');
  expect(pickTip(['headcount', 'insurance'], () => 0)).toBe('headcount');
});
