import { supabase } from '../../lib/supabase';
import { calculateDailyLaborEntry, defaultDailyWage, normalizeLaborer, recordDailyLaborPayment, saveDailyLaborEntry, saveDailyLaborer } from '../../lib/services/dailyLaborers';
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

it('기록에는 하루치 산출세액과 근무일 기준 고용보험을 남긴다(소득세는 지급할 때)', () => {
  expect(calculateDailyLaborEntry({ laborer_id: 'l', work_date: '2026-10-03', daily_wage: 180_000, extra_pay: 20_000 })).toMatchObject({
    is_weekend: true, day_income_tax: 1_350, employment_insurance: 1_800, calculation_version: '2026-v2' });
});
it('지급 처리는 묶음 합계로 소득세를 정해 RPC 한 번으로 보낸다', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'pay-1', error: null });
  const entry = (id: string) => ({ id, laborer_id: 'l', payment_id: null, gross: 187_000, day_income_tax: 999, employment_insurance: 1_680, calculation_version: '2026-v2' }) as DailyLaborEntry;
  await expect(recordDailyLaborPayment('s', 'l', ['a', 'b', 'c', 'd', 'e'].map(entry), '2026-10-31')).resolves.toBe('pay-1');
  expect(supabase.rpc).toHaveBeenCalledWith('record_daily_labor_payment', expect.objectContaining({
    p_entry_ids: ['a', 'b', 'c', 'd', 'e'], p_income_tax: 4_990, p_local_income_tax: 490, p_employment_insurance: 8_400, p_calculation_version: '2026-v2' }));
});
it('이미 지급한 기록은 다시 지급하지 않는다', async () => {
  await expect(recordDailyLaborPayment('s', 'l', [{ id: 'a', laborer_id: 'l', payment_id: 'p' } as DailyLaborEntry], '2026-10-31')).rejects.toThrow('미지급 기록');
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
