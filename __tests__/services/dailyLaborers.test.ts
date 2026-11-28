import { supabase } from '../../lib/supabase';
import {
  calculateDailyLaborEntry, deductionError, defaultDailyWage, INSURANCE_NOTICE_DAYS, isPayableDate, kindDailyWage, laborersAtInsuranceDays, normalizeLaborer,
  recordDailyLaborPayment, recordDailyLaborPayments, saveDailyLaborEntry, saveDailyLaborer,
} from '../../lib/services/dailyLaborers';
import type { DailyLaborEntry } from '../../types';

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('../../lib/services/cacheInvalidation', () => ({ invalidateCachedStore: jest.fn().mockResolvedValue(undefined) }));

function query(data: unknown = { id: 'e' }, error: unknown = null) {
  const q = { insert: jest.fn().mockReturnThis(), update: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue({ data, error }) };
  (supabase.from as jest.Mock).mockReturnValue(q);
  return q;
}
beforeEach(() => jest.clearAllMocks());
const entry = (id: string) => ({ id, laborer_id: 'l', payment_id: null, gross: 187_000, day_income_tax: 999, employment_insurance: 1_680, calculation_version: '2026-v2' }) as DailyLaborEntry;

it('기록에는 하루치 산출세액과 근무일 기준 고용보험을 남긴다(소득세는 지급할 때)', () => {
  expect(calculateDailyLaborEntry({ laborer_id: 'l', work_date: '2026-10-03', daily_wage: 180_000, extra_pay: 20_000 })).toMatchObject({
    is_weekend: true, day_income_tax: 1_350, employment_insurance: 1_800, calculation_version: '2026-v2' });
});
it('지급 완료 기록은 묶음 합계로 소득세를 정해 RPC 한 번으로 보낸다', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'pay-1', error: null });
  await expect(recordDailyLaborPayment('s', 'l', ['a', 'b', 'c', 'd', 'e'].map(entry), '2026-10-31', 'transfer')).resolves.toBe('pay-1');
  expect(supabase.rpc).toHaveBeenCalledWith('record_daily_labor_payment', expect.objectContaining({
    p_entry_ids: ['a', 'b', 'c', 'd', 'e'], p_income_tax: 4_990, p_local_income_tax: 490, p_employment_insurance: 8_400, p_calculation_version: '2026-v2',
    p_payment_method: 'transfer', p_estimated_income_tax: 4_990 }));
});
it('사용자가 고친 공제는 그대로 저장하고 예상값은 따로 보낸다', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: 'pay-2', error: null });
  await recordDailyLaborPayment('s', 'l', ['a', 'b', 'c', 'd', 'e'].map(entry), '2026-10-31', 'cash', { income_tax: 0, local_income_tax: 0, employment_insurance: 8_400 });
  expect(supabase.rpc).toHaveBeenLastCalledWith('record_daily_labor_payment', expect.objectContaining({
    p_payment_method: 'cash', p_income_tax: 0, p_local_income_tax: 0, p_estimated_income_tax: 4_990, p_estimated_local_income_tax: 490 }));
});
it('공제 합계가 세전보다 크면 막는다', async () => {
  await expect(recordDailyLaborPayment('s', 'l', ['a'].map(entry), '2026-10-31', 'cash', { income_tax: 10_000_000, local_income_tax: 0, employment_insurance: 0 })).rejects.toThrow('세전 금액보다');
});
it('이미 지급한 기록은 다시 지급하지 않는다', async () => {
  await expect(recordDailyLaborPayment('s', 'l', [{ id: 'a', laborer_id: 'l', payment_id: 'p' } as DailyLaborEntry], '2026-10-31', 'transfer')).rejects.toThrow('지급 대기 기록');
});
it('명단 수정에서 계좌번호를 비우면 기존 값을 보내지 않는다', async () => {
  const q = query({ id: 'l' });
  await saveDailyLaborer('s', { name: '홍길동', account_number: '' }, { id: 'l', revision: 0 });
  expect(q.update.mock.calls[0][0]).not.toHaveProperty('account_number');
});
it('기준이 확인되지 않은 달은 계산을 막는다', () => {
  expect(() => calculateDailyLaborEntry({ laborer_id: 'l', work_date: '2027-01-05', daily_wage: 150_000 })).toThrow('고용보험 요율');
});
it('주말이면 주말 일당, 없으면 평일 일당을 기본값으로 쓴다', () => {
  expect(defaultDailyWage({ weekday_wage: 150_000, weekend_wage: 170_000 }, '2026-10-03')).toBe(170_000);
  expect(defaultDailyWage({ weekday_wage: 150_000, weekend_wage: null }, '2026-10-03')).toBe(150_000);
  expect(defaultDailyWage({ weekday_wage: 150_000, weekend_wage: 170_000 }, '2026-10-05')).toBe(150_000);
});
it('명단 입력을 정리하고 잘못된 일당은 거절한다', () => {
  expect(normalizeLaborer({ name: ' 홍길동 ', account_number: '123-45 678' })).toMatchObject({ name: '홍길동', account_number: '12345678', phone: null });
  expect(() => normalizeLaborer({ name: '' })).toThrow('이름');
  expect(() => normalizeLaborer({ name: 'a', weekday_wage: -1 })).toThrow('평일 일당');
});
it('미지급 기록은 금액을 고칠 수 있고 revision으로 동시 수정을 막는다', async () => {
  const q = query();
  const previous = { id: 'e', revision: 3, daily_wage: 150_000, extra_pay: 0, payment_id: null } as DailyLaborEntry;
  await saveDailyLaborEntry('s', { laborer_id: 'l', work_date: '2026-10-05', daily_wage: 160_000 }, previous);
  expect(q.update).toHaveBeenCalledWith(expect.objectContaining({ daily_wage: 160_000, day_income_tax: 270 }));
  expect(q.eq).toHaveBeenCalledWith('revision', 3);
});
it('지급한 기록은 금액을 고치지 못하게 막는다', async () => {
  query();
  const previous = { id: 'e', revision: 3, daily_wage: 150_000, extra_pay: 0, payment_id: 'p' } as DailyLaborEntry;
  await expect(saveDailyLaborEntry('s', { laborer_id: 'l', work_date: '2026-10-05', daily_wage: 160_000 }, previous)).rejects.toThrow('지급을 취소한 뒤');
});
it('다른 곳에서 바뀌어 행이 없으면 성공으로 보지 않는다', async () => {
  query(null);
  await expect(saveDailyLaborEntry('s', { laborer_id: 'l', work_date: '2026-10-05', daily_wage: 1 }, { id: 'e', revision: 1, daily_wage: 1, extra_pay: 0, payment_id: null } as DailyLaborEntry))
    .rejects.toThrow('다른 곳에서');
});
it('같은 날 중복 기록은 안내 문구로 바꾼다', async () => {
  query(null, { code: '23505', message: 'duplicate' });
  await expect(saveDailyLaborEntry('s', { laborer_id: 'l', work_date: '2026-10-05', daily_wage: 1 })).rejects.toThrow('그날 근무 기록이 이미 있어요');
});

describe('S54 화면 계약', () => {
  it('평일/주말 구분으로 기본 일당을 고른다(주말 일당이 없으면 평일)', () => {
    expect(kindDailyWage({ weekday_wage: 130_000, weekend_wage: 150_000 }, true)).toBe(150_000);
    expect(kindDailyWage({ weekday_wage: 130_000, weekend_wage: null }, true)).toBe(130_000);
    expect(kindDailyWage({ weekday_wage: null, weekend_wage: 150_000 }, false)).toBeNull();
  });
  it('같은 달 근무일이 8일 이상인 사람만 국민연금·건강보험 안내 대상이다(같은 날 중복은 하루)', () => {
    const days = (id: string, n: number) => Array.from({ length: n }, (_, i) => ({ laborer_id: id, work_date: `2026-11-${String(i + 1).padStart(2, '0')}` }));
    const ids = laborersAtInsuranceDays([...days('a', 8), ...days('b', 7), ...days('b', 7)]);
    expect([...ids]).toEqual(['a']);
    expect(INSURANCE_NOTICE_DAYS).toBe(8);
  });
  it('지급일은 오늘까지만 고를 수 있다', () => {
    expect(isPayableDate('2026-11-28', '2026-11-28')).toBe(true);
    expect(isPayableDate('2026-11-29', '2026-11-28')).toBe(false);
    expect(isPayableDate('2026-02-30', '2026-11-28')).toBe(false);
  });
  it('공제는 0원 이상 정수이고 합계가 세전을 넘을 수 없다', () => {
    expect(deductionError(100_000, { income_tax: 0, local_income_tax: 0, employment_insurance: 900 })).toBeNull();
    expect(deductionError(100_000, { income_tax: 100_000, local_income_tax: 0, employment_insurance: 0 })).toBeNull();
    expect(deductionError(100_000, { income_tax: 100_000, local_income_tax: 1, employment_insurance: 0 })).toContain('세전 금액보다');
    expect(deductionError(100_000, { income_tax: -1, local_income_tax: 0, employment_insurance: 0 })).toContain('0원 이상');
    expect(deductionError(100_000, { income_tax: 1.5, local_income_tax: 0, employment_insurance: 0 })).toContain('0원 이상');
  });
  it('오늘 이후 지급일은 서버에 보내지 않는다', async () => {
    await expect(recordDailyLaborPayment('s', 'l', ['a'].map(entry), '2999-01-01', 'cash')).rejects.toThrow('오늘 이후');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
  it('여러 사람은 한 사람씩 보내고, 검사에 걸리면 아무것도 보내지 않는다', async () => {
    const other = (id: string) => ({ ...entry(id), laborer_id: 'm' }) as DailyLaborEntry;
    await expect(recordDailyLaborPayments('s', [
      { laborerId: 'l', entries: [entry('a')] },
      { laborerId: 'm', entries: [other('b')], deductions: { income_tax: 10_000_000, local_income_tax: 0, employment_insurance: 0 } },
    ], '2026-11-20', 'transfer')).rejects.toThrow('세전 금액보다');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
  it('일부만 저장되면 저장된 사람과 못 한 사람을 나눠 돌려준다', async () => {
    const other = (id: string) => ({ ...entry(id), laborer_id: 'm' }) as DailyLaborEntry;
    (supabase.rpc as jest.Mock)
      .mockResolvedValueOnce({ data: 'pay-l', error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '40001', message: 'DAILY_LABOR_PAYMENT_CHANGED' } });
    const result = await recordDailyLaborPayments('s', [{ laborerId: 'l', entries: [entry('a')] }, { laborerId: 'm', entries: [other('b')] }], '2026-11-20', 'cash');
    expect(result.recorded).toEqual(['l']);
    expect(result.failed).toEqual([{ laborerId: 'm', message: expect.stringContaining('다른 곳에서') }]);
    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'record_daily_labor_payment', expect.objectContaining({ p_laborer_id: 'l', p_payment_method: 'cash' }));
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'record_daily_labor_payment', expect.objectContaining({ p_laborer_id: 'm' }));
  });
});

describe('쓰기 뒤 새로고침 실패', () => {
  it('지급 되돌리기가 저장된 뒤 캐시 새로고침이 실패해도 실패로 바꾸지 않는다', async () => {
    const { invalidateCachedStore } = jest.requireMock('../../lib/services/cacheInvalidation');
    (invalidateCachedStore as jest.Mock).mockRejectedValueOnce(new Error('cache'));
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: null, error: null });
    const { cancelDailyLaborPayment } = jest.requireActual('../../lib/services/dailyLaborers');
    await expect(cancelDailyLaborPayment('s', 'pay-1')).resolves.toBeUndefined();
  });
});
