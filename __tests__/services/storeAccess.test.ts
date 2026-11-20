jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('../../lib/services/cacheInvalidation', () => ({ invalidateCachedStore: jest.fn().mockResolvedValue(undefined) }));
import { supabase } from '../../lib/supabase';
import { invalidateCachedStore } from '../../lib/services/cacheInvalidation';
import { getMyStoreAccess, setStoreManager } from '../../lib/services/storeAccess';
import { classifyStoreAccessError } from '../../lib/services/storeAccessErrors';
const rpc = supabase.rpc as jest.Mock;
export const ownerAccess = { store_id: 's', role: 'owner', employee_id: null, is_owner: true, is_manager: false,
  can_manage_store: true, can_manage_managers: true, can_manage_visibility: true, can_transfer_ownership: true,
  can_delete_store: true, can_view_owner_dashboard: true, manager_member_id: null, manager_employee_id: null, manager_revision: '9007199254740993' };
const mockFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('TEST_NETWORK_FORBIDDEN'); });
beforeEach(() => jest.clearAllMocks());
afterEach(() => expect(mockFetch).not.toHaveBeenCalled());
afterAll(() => mockFetch.mockRestore());
it('SQL 역할과 큰 revision을 손실 없이 반환하고 알 수 없는 필드를 버린다', async () => {
  rpc.mockResolvedValue({ data: { ...ownerAccess, secret: 'hidden' }, error: null });
  const result = await getMyStoreAccess('s');
  expect(result.status).toBe('success'); expect(result.data).toEqual(ownerAccess);
  expect(rpc).toHaveBeenCalledWith('get_my_store_access', { p_store_id: 's' });
});
it.each([null, { ...ownerAccess, store_id: 'other' }, { ...ownerAccess, manager_revision: 9007199254740992 }, { ...ownerAccess, role: 'admin' }])('불완전 계약 %j는 모든 권한을 닫는다', async data => {
  rpc.mockResolvedValue({ data, error: null });
  const result = await getMyStoreAccess('s');
  expect(result.status).toBe('unavailable'); expect(result.data.can_manage_store).toBe(false); expect(result.data.role).toBe(null);
});
it('조회 실패에서 raw admin 우회 조회 없이 닫는다', async () => {
  rpc.mockRejectedValue(new Error('private server details'));
  const result = await getMyStoreAccess('s');
  expect(result.status).toBe('unavailable'); expect(result.data.is_owner).toBe(false); expect(rpc).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(result)).not.toContain('private');
});
it('점장 지정은 문자열 CAS를 그대로 보내고 전체 매장 캐시를 무효화한다', async () => {
  rpc.mockResolvedValue({ data: { store_id: 's', member_id: 'm', employee_id: 'e', user_id: 'u', assigned_at: 'date', revision: '9007199254740994' }, error: null });
  const result = await setStoreManager('s', 'm', '9007199254740993');
  expect(result.status).toBe('success'); expect(rpc).toHaveBeenCalledWith('set_store_manager', { p_store_id: 's', p_member_id: 'm', p_expected_revision: '9007199254740993' });
  expect(invalidateCachedStore).toHaveBeenCalledWith('s');
});
it('CAS 충돌은 재조회 필요로 반환하며 자동 재시도하지 않는다', async () => {
  rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'MANAGER_REVISION_CONFLICT' } });
  expect(await setStoreManager('s', null, '1')).toMatchObject({ status: 'conflict', refreshRequired: true });
  expect(rpc).toHaveBeenCalledTimes(1);
});
it('오프라인은 요청 전 실패, 전송 예외는 결과불명이다', async () => {
  expect(await setStoreManager('s', null, '0', { online: false })).toMatchObject({ status: 'preflight_failed' });
  expect(rpc).not.toHaveBeenCalled(); rpc.mockRejectedValue(new Error('network'));
  expect(await setStoreManager('s', null, '0')).toMatchObject({ status: 'unknown' });
});
it.each(['STORE_OWNER_REQUIRED','MANAGER_REVISION_CONFLICT','VISIBILITY_REVISION_CONFLICT','MANAGER_CANDIDATE_INVALID'])('정해진 오류 %s만 분류하고 내부 원문을 반환하지 않는다', code => {
  expect(classifyStoreAccessError({ message: code, details: 'secret' }).code).toBe(code);
  expect(JSON.stringify(classifyStoreAccessError({ message: 'secret internal error' }))).not.toContain('secret');
});
it('시간 초과는 결과불명이며 재시도하지 않는다', async () => {
  rpc.mockReturnValue(new Promise(() => {}));
  expect(await setStoreManager('s', null, '0', { timeoutMs: 5 })).toMatchObject({ status: 'unknown' }); expect(rpc).toHaveBeenCalledTimes(1);
});
it('저장은 성공했지만 무효화가 실패하면 쓰기 재시도 대신 재조회한다', async () => {
  rpc.mockResolvedValue({ data: { store_id: 's', member_id: null, employee_id: null, user_id: null, assigned_at: null, revision: '1' }, error: null });
  (invalidateCachedStore as jest.Mock).mockRejectedValueOnce(new Error('cache'));
  expect(await setStoreManager('s', null, '0')).toMatchObject({ status: 'success', refreshRequired: true });
});
it.each(['owner','manager','employee','part_timer',null] as const)('새 역할 %s의 capability를 SQL 그대로 받는다', async role => {
  const owner = role === 'owner', manager = role === 'manager';
  rpc.mockResolvedValue({ data: { ...ownerAccess, role, is_owner: owner, is_manager: manager, can_manage_store: owner || manager,
    can_manage_managers: owner, can_manage_visibility: owner, can_transfer_ownership: owner, can_delete_store: owner, can_view_owner_dashboard: owner }, error: null });
  expect(await getMyStoreAccess('s')).toMatchObject({ status: 'success', data: { role, can_manage_store: owner || manager } });
});
it('역할과 capability가 충돌하면 닫는다', async () => {
  rpc.mockResolvedValue({ data: { ...ownerAccess, role: 'employee' }, error: null });
  expect(await getMyStoreAccess('s')).toMatchObject({ status: 'unavailable', data: { can_manage_store: false } });
});
it.each(['-1','1.2','01','9223372036854775808',''])('잘못된 revision %s는 전송하지 않는다', async revision => {
  expect(await setStoreManager('s', null, revision)).toMatchObject({ status: 'preflight_failed' }); expect(rpc).not.toHaveBeenCalled();
});

it('전송 실패만 임시 오류로 구분하고 손상된 권한 응답과 접근 거부는 닫는다', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { code: '', message: 'Network request failed' } });
  expect(await getMyStoreAccess('s')).toMatchObject({ status: 'unavailable', error: { transient: true } });
  for (const response of [
    { data: {}, error: null },
    { data: { ...ownerAccess, role: 'employee' }, error: null },
    { data: null, error: { code: '42501' } },
  ]) {
    rpc.mockResolvedValueOnce(response);
    const result = await getMyStoreAccess('s');
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') expect(result.error.transient).toBeFalsy();
  }
});
