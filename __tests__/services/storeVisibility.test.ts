jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('../../lib/services/cacheInvalidation', () => ({ invalidateCachedStore: jest.fn().mockResolvedValue(undefined) }));
import { supabase } from '../../lib/supabase';
import { updateFinancialSharing, FinancialSharingWriteError } from '../../lib/services/stores';
import { getMyStoreVisibility, setStoreVisibility, getSharedAttendance, getSharedAttendanceRequests, getSharedPayroll, getSharedEmployeePay, getSharedFinancialSummary } from '../../lib/services/storeVisibility';
const rpc = supabase.rpc as jest.Mock;
const visibility: import('../../types').StoreVisibility = { store_id: 's', financial_share_scope: 'none', attendance_share_scope: 'none', payroll_share_scope: 'none', visibility_revision: '5', can_manage_visibility: false, can_read_financials: false, can_read_other_attendance: false, can_read_other_payroll: false };
const mockFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('TEST_NETWORK_FORBIDDEN'); });
beforeEach(() => jest.clearAllMocks());
afterEach(() => expect(mockFetch).not.toHaveBeenCalled());
afterAll(() => mockFetch.mockRestore());
it('독립 3설정과 CAS 문자열을 보내고 충돌을 구분한다', async () => {
  rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'VISIBILITY_REVISION_CONFLICT' } });
  expect(await setStoreVisibility('s', visibility, '5')).toMatchObject({ status: 'conflict', refreshRequired: true });
  expect(rpc).toHaveBeenCalledWith('set_store_visibility', { p_store_id: 's', p_financial_scope: 'none', p_attendance_scope: 'none', p_payroll_scope: 'none', p_expected_revision: '5' });
});
it('설정 계약이 불완전하면 성공으로 처리하지 않는다', async () => {
  rpc.mockResolvedValue({ data: { ...visibility, visibility_revision: 5 }, error: null });
  expect(await getMyStoreVisibility('s')).toMatchObject({ status: 'unknown' });
});
it.each([
  ['attendance', getSharedAttendance, { storeId: 's', fromDate: '2026-11-01', toDate: '2026-11-17' }, { employee_id: 'e', employee_name: '가상', kind: 'in', punched_at: 'date', work_date: '2026-11-01', flags: [], status: 'recorded' }],
  ['attendance_requests', getSharedAttendanceRequests, { storeId: 's', fromDate: '2026-11-01', toDate: '2026-11-17' }, { employee_id: 'e', employee_name: '가상', kind: 'in', requested_time: null, work_date: null, status: 'pending' }],
  ['payroll', getSharedPayroll, { storeId: 's', yearMonth: '2026-11' }, { employee_id: 'e', employee_name: '가상', year_month: '2026-11', gross: null, applied_hourly_wage: null }],
  ['employee_pay', getSharedEmployeePay, { storeId: 's' }, { employee_id: 'e', employee_name: '가상', base_salary: null, hourly_wage: 12000 }],
] as const)('%s 본인 열람은 보존하고 허용 필드만 반환한다', async (name, fn, input, row) => {
  rpc.mockResolvedValueOnce({ data: visibility, error: null }).mockResolvedValueOnce({ data: [{ ...row, bank_account: 'SECRET', reason: 'PRIVATE' }], error: null });
  const result = await (fn as (i: any) => Promise<any>)(input);
  expect(result).toMatchObject({ status: 'success', data: { access: 'self_only', rows: [row] } });
  expect(rpc.mock.calls[1][0]).toBe(`get_shared_${name}`);
  expect(JSON.stringify(result)).not.toContain('SECRET'); expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it('손익 거절은 0원이나 빈 성공으로 바꾸지 않는다', async () => {
  rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'FINANCIAL_SHARING_DENIED' } });
  expect(await getSharedFinancialSummary('s', '2026-11')).toMatchObject({ status: 'denied' });
});
it('허용된 전체 범위와 본인 범위를 구분한다', async () => {
  rpc.mockResolvedValueOnce({ data: { ...visibility, can_read_other_payroll: true }, error: null }).mockResolvedValueOnce({ data: [], error: null });
  expect(await getSharedPayroll({ storeId: 's', yearMonth: '2026-11' })).toMatchObject({ status: 'success', data: { access: 'store', rows: [] } });
});
it('설정 조회 거절은 추가 원자료 조회를 하지 않는다', async () => {
  rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
  expect(await getSharedEmployeePay({ storeId: 's' })).toMatchObject({ status: 'denied' }); expect(rpc).toHaveBeenCalledTimes(1);
});
it('페이지·날짜·월 입력 오류는 요청 전에 거절한다', async () => {
  expect(await getSharedPayroll({ storeId: 's', yearMonth: '2026-13' })).toMatchObject({ status: 'preflight_failed' });
  expect(await getSharedAttendance({ storeId: 's', fromDate: '2026-02-30', toDate: '2026-03-01' })).toMatchObject({ status: 'preflight_failed' });
  expect(rpc).not.toHaveBeenCalled();
});
it('허용 손익도 null 금액과 allowlist를 보존한다', async () => {
  const row = { store_id: 's', year_month: '2026-11', revenue: 10, purchase_cost: 0, labor_cost: null, fixed_expense: 1, variable_expense: 2, operating_profit: null };
  rpc.mockResolvedValue({ data: [{ ...row, wages: ['PRIVATE'] }], error: null });
  expect(await getSharedFinancialSummary('s', '2026-11')).toEqual({ status: 'success', data: row });
});
it('최대 페이지는 다음 offset을 반환하고 날짜 인자를 보존한다', async () => {
  const row = { employee_id: 'e', employee_name: '가상', base_salary: null, hourly_wage: null };
  rpc.mockResolvedValueOnce({ data: visibility, error: null }).mockResolvedValueOnce({ data: [row], error: null });
  expect(await getSharedEmployeePay({ storeId: 's', pageSize: 1, offset: 2 })).toMatchObject({ status: 'success', data: { nextOffset: 3 } });
  expect(rpc.mock.calls[1][1]).toEqual({ p_store_id: 's', p_limit: 1, p_offset: 2 });
});
it('정상 저장은 독립 설정과 서버 revision을 반환한다', async () => {
  rpc.mockResolvedValue({ data: { ...visibility, financial_share_scope: 'all_staff', visibility_revision: '6', unknown: 'SECRET' }, error: null });
  expect(await setStoreVisibility('s', { ...visibility, financial_share_scope: 'all_staff' }, '5')).toMatchObject({ status: 'success', data: { financial_share_scope: 'all_staff', attendance_share_scope: 'none', payroll_share_scope: 'none', visibility_revision: '6' } });
});
it('손익 공유 단독 호환 저장도 CAS를 사용하며 타 설정을 보존한다', async () => {
  rpc.mockResolvedValueOnce({ data: { ...visibility, attendance_share_scope: 'all_staff', payroll_share_scope: 'regular_only' }, error: null })
    .mockResolvedValueOnce({ data: { ...visibility, attendance_share_scope: 'all_staff', payroll_share_scope: 'regular_only', financial_share_scope: 'all_staff', visibility_revision: '6' }, error: null });
  await updateFinancialSharing('s', 'all_staff');
  expect(rpc.mock.calls[1]).toEqual(['set_store_visibility', { p_store_id: 's', p_financial_scope: 'all_staff', p_attendance_scope: 'all_staff', p_payroll_scope: 'regular_only', p_expected_revision: '5' }]);
});

it.each(['unknown','conflict'] as const)('단일 공유 호환 서비스는 %s의 타입을 보존한다',async status=>{
 rpc.mockResolvedValueOnce({data:visibility,error:null});
 if(status==='unknown')rpc.mockRejectedValueOnce(new Error('response lost'));
 else rpc.mockResolvedValueOnce({data:null,error:{message:'VISIBILITY_REVISION_CONFLICT'}});
 const error=await updateFinancialSharing('s','none').catch(e=>e);
 expect(error).toBeInstanceOf(FinancialSharingWriteError);
 expect(error.status).toBe(status);
});
