import { supabase } from '../../lib/supabase';
import { calculatePayroll, saveWorkedMinutes } from '../../lib/services/payroll';
import type { Employee } from '../../types';

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
const employee = { id: 'e', store_id: 's', employment_type: 'regular', base_salary: 3000000,
  non_taxable: 200000, dependents: 1 } as Employee;
function taxResult(data: unknown, error: unknown = null) {
  const q = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(), gt: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockReturnThis(),
    overrideTypes: jest.fn().mockResolvedValue({ data, error }) };
  (supabase.from as jest.Mock).mockReturnValue(q);
  return q;
}
beforeEach(() => jest.clearAllMocks());
it('급여 대상 연도로 세액표를 조회하고 계산 버전을 저장한다', async () => {
  const q = taxResult({ amount: 12340 });
  const pay = await calculatePayroll(employee, undefined, '2026-03');
  expect(q.eq).toHaveBeenCalledWith('year', 2026);
  expect(pay).toMatchObject({ income_tax: 12340, calculation_version: '2026-v2' });
});
it.each([[null, { message: 'DB unavailable' }], [null, null], [{ amount: null }, null], [{ amount: 'NaN' }, null]])(
  '세액표 오류·누락·잘못된 금액이면 추정값을 반환하지 않는다', async (data, error) => {
    taxResult(data, error);
    await expect(calculatePayroll(employee, undefined, '2026-10')).rejects.toThrow('급여를 계산하지 못했어요');
  });
it('지원하지 않는 연도는 현재 연도 보험료로 계산하지 않는다', async () => {
  await expect(calculatePayroll(employee, undefined, '2027-01')).rejects.toThrow('2027년 건강보험 요율을 아직 확인하지 못해');
  expect(supabase.from).not.toHaveBeenCalled();
});
it('세액표 조회 실패 후 급여를 저장하지 않는다', async () => {
  taxResult(null, { message: 'timeout' });
  await expect(saveWorkedMinutes('s', { ...employee, employment_type: 'part_time', non_taxable: 0, weekly_minutes: 2400 }, '2026-10',
    { minutes: '6000', hourlyWage: 12000, note: '집계' })).rejects.toThrow('급여를 계산하지 못했어요');
  expect(supabase.from).not.toHaveBeenCalledWith('payroll');
});
it('0원 세액은 정상 값으로 취급한다', async () => {
  taxResult({ amount: 0 });
  expect((await calculatePayroll(employee, undefined, '2026-10')).income_tax).toBe(0);
});
it('일별 반올림 합계를 가중평균 시급으로 재계산하지 않고 공제 기준으로 사용한다', async () => {
  taxResult({ amount: 0 });
  const pay = await calculatePayroll({ ...employee, employment_type: 'part_time' }, undefined, '2026-10', 20334);
  expect(pay.gross).toBe(20334);
  expect(pay.net_pay).toBe(pay.gross-pay.national_pension-pay.health_insurance-pay.long_term_care-pay.employment_insurance-pay.income_tax-pay.local_income_tax-pay.withholding_tax);
});
it.each([-1, 1.5, NaN, Infinity])('잘못된 세전 스냅샷 합계 %s를 거절한다', async amount => {
  await expect(calculatePayroll(employee, undefined, '2026-10', amount)).rejects.toThrow('세전 금액');
  expect(supabase.from).not.toHaveBeenCalled();
});
it('간이세액표 첫 구간(77만 원) 미만은 조회 없이 소득세 0원이다', async () => {
  const pay = await calculatePayroll({ ...employee, employment_type: 'part_time', non_taxable: 0, weekly_minutes: 2400 } as Employee, undefined, '2026-10', 700_000);
  expect(supabase.from).not.toHaveBeenCalled();
  expect(pay).toMatchObject({ income_tax: 0, local_income_tax: 0, national_pension: premiumOf(700_000, 0.0475) });
});
it('주 근무시간이 비어 있으면 3.3%로 추정하지 않고 공제하지 않는다', async () => {
  const pay = await calculatePayroll({ ...employee, employment_type: 'part_time', weekly_minutes: null } as Employee, undefined, '2026-10', 500_000);
  expect(pay).toMatchObject({ withholding_tax: 0, national_pension: 0, income_tax: 0, net_pay: 500_000 });
});
it('수습 표시 직원은 대상 월의 수습일만 90%로 계산한다', async () => {
  taxResult({ amount: 0 });
  const probation = { ...employee, is_probation: true, joined_at: '2026-09-16', probation_started_at: null, probation_ends_on: '2026-10-15' } as Employee;
  // 9월: 30일 중 16~30일(15일)만 수습 → (15×0.9+15)/30 = 0.95
  expect((await calculatePayroll(probation, undefined, '2026-09')).gross).toBe(2_850_000);
  expect((await calculatePayroll(probation, undefined, '2026-11')).gross).toBe(3_000_000);
  expect((await calculatePayroll({ ...probation, is_probation: false }, undefined, '2026-09')).gross).toBe(3_000_000);
});
function premiumOf(base: number, rate: number) { return Math.floor(base * rate / 10) * 10; }
