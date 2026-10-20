import { supabase } from '../../lib/supabase';
import { Employee, Payroll } from '../../types';
import { calculatePayroll, getPayrollSettlementGaps, saveWorkedMinutes } from '../../lib/services/payroll';
import { calculateHourlyGross, formatWorkedMinutes, parseWorkedMinutes } from '../../lib/utils/workMinutes';

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../lib/services/employees', () => ({ isInProbation: () => false, isInsuranceApplicable: () => false }));

const employee = { id: 'emp', store_id: 'store', employment_type: 'part_time', hourly_wage: 12000,
  base_salary: 0, dependents: 1, non_taxable: 0 } as Employee;
const previous = { id: 'pay', store_id: 'store', employee_id: 'emp', year_month: '2026-10', revision: 4,
  gross: 100000, net_pay: 97000, taxable_base: 0, national_pension: 0, health_insurance: 0,
  long_term_care: 0, employment_insurance: 0, income_tax: 0, local_income_tax: 0, withholding_tax: 3000,
  worked_minutes: 500, is_settled: true } as Payroll;
const input = { minutes: '600', hourlyWage: 12000, note: '월 집계표, 휴게 제외' };
const regularEmployee = { ...employee, id: 'regular', employment_type: 'regular', base_salary: 3_000_000, is_active: true } as Employee;
const partTimeEmployee = { ...employee, is_active: true } as Employee;

function query(data: unknown = { ...previous, revision: 5 }, error: unknown = null) {
  const q = { insert: jest.fn().mockReturnThis(), update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data, error }) };
  (supabase.from as jest.Mock).mockReturnValue(q);
  return q;
}

describe('월별 근무 분 입력', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['', '-1', '2.5', '1,000', '1e3', 'NaN'])('잘못된 근무 분 %p을 거부한다', value => {
    expect(() => parseWorkedMinutes(value, '2026-10')).toThrow();
  });
  it('미입력과 실제 0분을 구분한다', () => {
    expect(() => parseWorkedMinutes('', '2026-10')).toThrow();
    expect(parseWorkedMinutes('0', '2026-10')).toBe(0);
    expect(formatWorkedMinutes(null)).toBe('미입력');
    expect(formatWorkedMinutes(0)).toBe('0분 (0시간 0분)');
  });
  it('월별 일수와 윤년을 검증한다', () => {
    expect(parseWorkedMinutes(String(29 * 1440), '2028-02')).toBe(41760);
    expect(() => parseWorkedMinutes(String(29 * 1440), '2026-02')).toThrow();
    expect(() => parseWorkedMinutes('44641', '2026-10')).toThrow();
    expect(() => parseWorkedMinutes('10', '2026-13')).toThrow();
  });
  it('총 분 기준으로 계산하고 마지막에 원 단위 반올림한다', () => {
    expect(calculateHourlyGross(61, 10000)).toBe(10167);
    expect(calculateHourlyGross(0, 12000)).toBe(0);
    expect(formatWorkedMinutes(9600)).toBe('9,600분 (160시간 0분)');
  });
  it('파트타이머는 시간을 입력하지 않고 급여를 계산할 수 없다', async () => {
    await expect(calculatePayroll(employee)).rejects.toThrow('총 근무 분');
  });
  it('정규직은 근무 분 없이 월급을 계산할 수 있다', async () => {
    const result = await calculatePayroll(regularEmployee);
    expect(result.gross).toBe(3_000_000);
  });
  it('정산 점검에서 정규직의 null 근무 분은 허용하고 파트타이머만 요구한다', () => {
    const regularPayroll = { ...previous, employee_id: 'regular', worked_minutes: null } as Payroll;
    const partTimePayroll = { ...previous, worked_minutes: null } as Payroll;
    const missing = getPayrollSettlementGaps([regularEmployee, partTimeEmployee], [regularPayroll, partTimePayroll]);
    expect(missing.missingPayroll).toHaveLength(0);
    expect(missing.missingPartTimeMinutes.map(row => row.id)).toEqual(['emp']);
  });
  it('파트타이머 0분은 입력 완료로 보고 정규직 급여 누락은 별도로 표시한다', () => {
    const partTimePayroll = { ...previous, worked_minutes: 0 } as Payroll;
    const missing = getPayrollSettlementGaps([regularEmployee, partTimeEmployee], [partTimePayroll]);
    expect(missing.missingPayroll.map(row => row.id)).toEqual(['regular']);
    expect(missing.missingPartTimeMinutes).toHaveLength(0);
  });
  it('0분 급여에는 공제가 붙지 않는다', async () => {
    const result = await calculatePayroll(employee, { minutes: 0, hourlyWage: 12000 });
    expect(result).toMatchObject({ gross: 0, net_pay: 0, withholding_tax: 0, national_pension: 0 });
  });
  it('근무 분·급여를 함께 저장하고 정산을 해제한다', async () => {
    const q = query();
    await saveWorkedMinutes('store', employee, '2026-10', input, previous);
    expect(q.update).toHaveBeenCalledWith(expect.objectContaining({
      worked_minutes: 600, applied_hourly_wage: 12000, gross: 120000, net_pay: 116040,
      work_source: 'manual', work_note: input.note, is_settled: false, settled_at: null,
    }));
    expect(q.eq).toHaveBeenCalledWith('revision', 4);
  });
  it('정규직의 시간 입력은 기존 월급·수정 공제액을 보존한다', async () => {
    const q = query();
    await saveWorkedMinutes('store', { ...employee, employment_type: 'regular' }, '2026-10', input, previous);
    expect(q.update).toHaveBeenCalledWith(expect.objectContaining({ gross: previous.gross,
      withholding_tax: previous.withholding_tax, net_pay: previous.net_pay, worked_minutes: 600, applied_hourly_wage: null }));
  });
  it('서로 다른 매장·월의 급여를 덮어쓸 수 없다', async () => {
    await expect(saveWorkedMinutes('store', employee, '2026-09', input, previous)).rejects.toThrow('대상 월');
    await expect(saveWorkedMinutes('other', employee, '2026-10', input)).rejects.toThrow('대상 월');
    expect(supabase.from).not.toHaveBeenCalled();
  });
  it('수정 근거가 없거나 소수 시급 정밀도를 넘으면 쓰지 않는다', async () => {
    await expect(saveWorkedMinutes('store', employee, '2026-10', { ...input, note: '' })).rejects.toThrow('사유');
    await expect(saveWorkedMinutes('store', employee, '2026-10', { ...input, hourlyWage: 12000.12345 })).rejects.toThrow('시급');
    expect(supabase.from).not.toHaveBeenCalled();
  });
  it('동시 수정으로 대상 revision이 달라졌으면 성공으로 표시하지 않는다', async () => {
    query(null);
    await expect(saveWorkedMinutes('store', employee, '2026-10', input, previous)).rejects.toThrow('새로고침');
  });
  it('동시 신규 작성 충돌은 새로고침을 안내한다', async () => {
    query(null, { code: '23505', message: 'duplicate' });
    await expect(saveWorkedMinutes('store', employee, '2026-10', input)).rejects.toThrow('새로고침');
  });
  it('권한·DB 오류를 숨기지 않는다', async () => {
    query(null, { code: '42501', message: '권한 없음' });
    await expect(saveWorkedMinutes('store', employee, '2026-10', input)).rejects.toThrow('권한 없음');
  });
});
