import { supabase } from '../../lib/supabase';
import { calculatePayroll, saveWorkedMinutes } from '../../lib/services/payroll';
import type { Employee } from '../../types';

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../lib/services/employees', () => ({ isInProbation: () => false, isInsuranceApplicable: () => true }));
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
  expect(pay).toMatchObject({ income_tax: 12340, calculation_version: '2026-v1' });
});
it.each([[null, { message: 'DB unavailable' }], [null, null], [{ amount: null }, null], [{ amount: 'NaN' }, null]])(
  '세액표 오류·누락·잘못된 금액이면 추정값을 반환하지 않는다', async (data, error) => {
    taxResult(data, error);
    await expect(calculatePayroll(employee, undefined, '2026-10')).rejects.toThrow('급여를 계산하지 못했어요');
  });
it('지원하지 않는 연도는 현재 연도 보험료로 계산하지 않는다', async () => {
  await expect(calculatePayroll(employee, undefined, '2027-01')).rejects.toThrow('계산 기준');
  expect(supabase.from).not.toHaveBeenCalled();
});
it('세액표 조회 실패 후 급여를 저장하지 않는다', async () => {
  taxResult(null, { message: 'timeout' });
  await expect(saveWorkedMinutes('s', { ...employee, employment_type: 'part_time', non_taxable: 0 }, '2026-10',
    { minutes: '600', hourlyWage: 12000, note: '집계' })).rejects.toThrow('급여를 계산하지 못했어요');
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
