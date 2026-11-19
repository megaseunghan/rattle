jest.mock('../../lib/services/attendanceCredentials', () => ({ clearAttendanceDeviceCredentials: jest.fn().mockResolvedValue(true) }));
import { clearAttendanceDeviceCredentials } from '../../lib/services/attendanceCredentials';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../../lib/query/client';
import { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../../lib/contexts/AuthContext';
import { getMyStoreAccess, closedStoreAccess } from '../../lib/services/storeAccess';
import { getMyStoreVisibility } from '../../lib/services/storeVisibility';
import { invalidateStoreData } from '../../lib/query/client';
import { supabase } from '../../lib/supabase';
import { getExpenseCategories, setExpenseCategorySession, toggleExpenseCategory } from '../../lib/utils/expenseCategorySession';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(),
}));
jest.mock('../../lib/supabase', () => ({ supabase: {
  from: jest.fn(), auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
} }));

jest.mock('../../lib/services/storeAccess', () => ({
  ...jest.requireActual('../../lib/services/storeAccess'), getMyStoreAccess: jest.fn(),
}));
jest.mock('../../lib/services/storeVisibility', () => ({ getMyStoreVisibility: jest.fn() }));
const ownerAccess = (id: string, revision = '1') => ({ ...closedStoreAccess(id), role: 'owner', is_owner: true,
  can_manage_store: true, can_manage_managers: true, can_manage_visibility: true,
  can_transfer_ownership: true, can_delete_store: true, can_view_owner_dashboard: true, manager_revision: revision });
const visibility = (id: string) => ({ store_id: id, visibility_revision: '1', financial_share_scope: 'none',
  attendance_share_scope: 'none', payroll_share_scope: 'none', can_manage_visibility: true,
  can_read_financials: true, can_read_other_attendance: true, can_read_other_payroll: true });
let network: jest.SpyInstance;
beforeAll(() => { network = jest.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('테스트에서 네트워크를 사용할 수 없어요'); }); });
afterEach(() => { expect(network).not.toHaveBeenCalled(); });
afterAll(() => network.mockRestore());
const stores = [{ id: 'a', name: '첫 매장', owner_id: 'user' }, { id: 'b', name: '둘째 매장', owner_id: 'user' }];
const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
let notify: (event: string, session: unknown) => void;

function queries(owned: unknown = { data: stores, error: null }) {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const value = table === 'stores' ? owned : { data: [], error: null };
    return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(), then: (resolve: (v: unknown) => void) => Promise.resolve(value).then(resolve) };
  });
}
async function login() {
  const hook = renderHook(useAuth, { wrapper });
  act(() => notify('INITIAL_SESSION', { user: { id: 'user' } }));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}
beforeEach(() => {
  setExpenseCategorySession(null);
  queryClient.clear();
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue('a');
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });
  (supabase.auth.onAuthStateChange as jest.Mock).mockImplementation(callback => {
    notify = callback;
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  });
  queries();
  (getMyStoreAccess as jest.Mock).mockImplementation(async id => ({ status: 'success', data: ownerAccess(id) }));
  (getMyStoreVisibility as jest.Mock).mockImplementation(async id => ({ status: 'success', data: visibility(id) }));
});

it('비용 분류 펼침은 인증 갱신에 유지되고 로그아웃 후 새 로그인에서 초기화된다', async () => {
  const { result } = await login();
  toggleExpenseCategory('user', 'a', '고정비');
  act(() => notify('TOKEN_REFRESHED', { user: { id: 'user' } }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(getExpenseCategories('user', 'a').고정비).toBe(true);
  await act(async () => { await result.current.signOut(); });
  expect(getExpenseCategories('user', 'a')).toEqual({});
  act(() => notify('SIGNED_IN', { user: { id: 'user' } }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(getExpenseCategories('user', 'a')).toEqual({});
});

it('매장 선택은 새 매장의 권한을 재확인하고 마지막 선택을 저장한다', async () => {
  const { result } = await login();
  (supabase.from as jest.Mock).mockClear();
  await act(async () => { await result.current.switchStore('b'); });
  expect(result.current.store?.id).toBe('b');
  expect(getMyStoreAccess).toHaveBeenCalledWith('b', expect.objectContaining({ signal: expect.anything() }));
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('LAST_STORE_ID', 'b');
});
it('저장된 매장이 목록에서 사라졌으면 첫 접근 가능 매장을 선택한다', async () => {
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue('removed');
  const { result } = await login();
  expect(result.current.store?.id).toBe('a');
});
it('목록 조회가 실패하면 기존 매장을 지우거나 일부 목록으로 바꾸지 않는다', async () => {
  const { result } = await login();
  queries({ data: null, error: { message: 'Gateway Timeout' } });
  await act(async () => { await expect(result.current.refreshStore()).rejects.toThrow('Gateway Timeout'); });
  expect(result.current.store?.id).toBe('a');
  expect(result.current.stores).toHaveLength(2);
});
it('목록에 없는 매장은 선택하거나 저장할 수 없다', async () => {
  const { result } = await login();
  await act(async () => { await expect(result.current.switchStore('outside')).rejects.toThrow('다시 확인'); });
  expect(result.current.store?.id).toBe('a');
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});
it('이전 목록 요청이 늦게 끝나도 새로 선택한 매장을 덮어쓰지 않는다', async () => {
  const { result } = await login();
  let done!: (value: unknown) => void;
  queries(new Promise(resolve => { done = resolve; }));
  let refresh!: Promise<void>;
  act(() => { refresh = result.current.refreshStore(); });
  queries();
  await act(async () => { await result.current.switchStore('b'); });
  await act(async () => { done({ data: stores, error: null }); await refresh; });
  expect(result.current.store?.id).toBe('b');
});
it('선택 저장 실패 시 기존 매장과 미리보기를 유지한다', async () => {
  const { result } = await login();
  act(() => result.current.setDevPreview('part_time', 'employee'));
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
  await act(async () => { await expect(result.current.switchStore('b')).rejects.toThrow('disk full'); });
  expect(result.current.store?.id).toBe('a');
  expect(result.current.devPreviewMode).toBe('part_time');
});

it('인증 갱신 직후 매장을 선택해도 앱 로딩 상태가 끝난다', async () => {
  const { result } = await login();
  let lastStore = 'a';
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async () => lastStore);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (_key, value) => { lastStore = value; });
  await act(async () => {
    notify('TOKEN_REFRESHED', { user: { id: 'user' } });
    await result.current.switchStore('b');
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.store?.id).toBe('b');
});
it('로그아웃 뒤 늦게 끝나는 매장 조회로 로그인 자료를 복원하지 않는다', async () => {
  const { result } = await login();
  let done!: (value: unknown) => void;
  queries(new Promise(resolve => { done = resolve; }));
  let pending!: Promise<void>;
  act(() => { pending = result.current.refreshStore(); });
  await act(async () => { await result.current.signOut(); });
  await act(async () => { done({ data: stores, error: null }); await pending; });
  expect(result.current.store).toBeNull();
  expect(result.current.stores).toEqual([]);
});


it('계정 캐시 정리의 취소가 늦게 끝나도 새로 마운트된 조회를 지우지 않는다', async () => {
  let cancelled!: () => void;
  const cancellation = new Promise<void>(resolve => { cancelled = resolve; });
  let complete!: (value: string) => void;
  const response = new Promise<string>(resolve => { complete = resolve; });
  const fetch = jest.fn(() => response);
  const cancel = jest.spyOn(queryClient, 'cancelQueries').mockReturnValue(cancellation);
  try {
    const hook = renderHook(() => {
      const auth = useAuth();
      const summary = useQuery({ queryKey: ['identity-regression', auth.user?.id, auth.store?.id], queryFn: fetch, enabled: !!auth.store }, queryClient);
      return { auth, summary };
    }, { wrapper });
    act(() => notify('INITIAL_SESSION', { user: { id: 'user' } }));
    await waitFor(() => expect(hook.result.current.auth.store?.id).toBe('a'));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await act(async () => { cancelled(); await cancellation; });
    await act(async () => { complete('fresh summary'); await response; });
    await waitFor(() => expect(hook.result.current.summary.data).toBe('fresh summary'));
    expect(queryClient.getQueryData(['identity-regression', 'user', 'a'])).toBe('fresh summary');
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally { cancelled(); complete('cleanup'); cancel.mockRestore(); queryClient.clear(); }
});

it('생성한 매장은 새로 받은 목록에서 ID를 선택하고 마지막 매장으로 저장한다', async () => {
  const { result } = await login();
  queries({ data: [...stores, { id: 'new', name: '새 매장', owner_id: 'user' }], error: null });
  await act(async () => { await result.current.refreshStore('new'); });
  expect(result.current.store?.id).toBe('new');
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('LAST_STORE_ID', 'new');
});
it('생성 후 새 목록에서 찾지 못하면 기존 매장으로 성공 처리하지 않는다', async () => {
  const { result } = await login();
  await act(async () => { await expect(result.current.refreshStore('missing')).rejects.toThrow('만들어진 매장'); });
  expect(result.current.store?.id).toBe('a');
});
it('생성 선택 요청이 일반 목록 갱신에 밀리면 성공 대신 재시도 오류를 반환한다', async () => {
  const { result } = await login();
  let release!: (value: unknown) => void;
  queries(new Promise(resolve => { release = resolve; }));
  let outcome!: Promise<unknown>;
  act(() => { outcome = result.current.refreshStore('new').catch(error => error); });
  queries({ data: stores, error: null });
  await act(async () => { await result.current.refreshStore(); });
  await act(async () => { release({ data: [...stores, { id: 'new', owner_id: 'user' }], error: null }); });
  expect((await outcome as Error).message).toContain('같은 설정으로 다시 시도');
  expect(result.current.store?.id).toBe('a');
});

it('권한 조회 실패는 사장 매장도 관리·재무·대시보드를 닫는다', async () => {
  (getMyStoreAccess as jest.Mock).mockImplementation(async id => ({ status: 'unavailable', data: closedStoreAccess(id) }));
  const { result } = await login();
  expect(result.current).toMatchObject({ currentRole: 'member', realRole: 'member', canManageStore: false,
    canReadFinancials: false, canViewOwnerDashboard: false, storeRole: null });
});
it('점장은 관리할 수 있지만 사장 대시보드와 사장 전용 capability는 없다', async () => {
  (getMyStoreAccess as jest.Mock).mockImplementation(async id => ({ status: 'success', data: {
    ...closedStoreAccess(id), role: 'manager', is_manager: true, can_manage_store: true, manager_revision: '9223372036854775807',
  } }));
  const { result } = await login();
  expect(result.current.storeRole).toBe('manager');
  expect(result.current.canManageStore).toBe(true);
  expect(result.current.canViewOwnerDashboard).toBe(false);
  expect(result.current.access.can_manage_visibility).toBe(false);
  expect(result.current.access.manager_revision).toBe('9223372036854775807');
});
it('미리보기는 관리 capability와 사장 대시보드 및 쓰기를 닫는다', async () => {
  const { result } = await login();
  act(() => result.current.setDevPreview('regular', 'employee'));
  expect(result.current.storeRole).toBe('employee');
  expect(result.current.realRole).toBe('admin');
  expect(result.current.currentRole).toBe('member');
  expect(result.current.canManageStore).toBe(false);
  expect(result.current.access.can_delete_store).toBe(false);
  expect(result.current.canViewOwnerDashboard).toBe(false);
});
it('권한 회수 무효화 직후 캐시를 폐기하고 늦은 이전 권한을 복원하지 않는다', async () => {
  const { result } = await login();
  queryClient.setQueryData(['rattle', 'old', 'a', 'shared-payroll'], [{ gross: 100 }]);
  let release!: (value: unknown) => void;
  (getMyStoreAccess as jest.Mock).mockImplementation(id => id === 'a' ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ status: 'success', data: ownerAccess(id) }));
  let pending!: Promise<void>;
  act(() => { pending = result.current.refreshStore(); });
  await waitFor(() => expect(result.current.canManageStore).toBe(false));
  expect(queryClient.getQueryData(['rattle', 'old', 'a', 'shared-payroll'])).toBeUndefined();
  (getMyStoreAccess as jest.Mock).mockImplementation(async id => ({ status: 'success', data: { ...closedStoreAccess(id), role: 'employee', manager_revision: '2' } }));
  await act(async () => { await invalidateStoreData('a'); });
  await waitFor(() => expect(result.current.storeRole).toBe('employee'));
  await act(async () => { release({ status: 'success', data: ownerAccess('a') }); await pending; });
  expect(result.current.canManageStore).toBe(false);
});
it('계정 전환 후 늦은 권한 응답을 폐기한다', async () => {
  queries({ data: [stores[0]], error: null });
  const { result } = await login();
  let release!: (value: unknown) => void;
  (getMyStoreAccess as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  let pending!: Promise<void>;
  act(() => { pending = result.current.refreshStore(); });
  await waitFor(() => expect(getMyStoreAccess).toHaveBeenCalledTimes(2));
  act(() => notify('SIGNED_OUT', null));
  await act(async () => { release({ status: 'success', data: ownerAccess('a') }); await pending; });
  expect(result.current.storeRole).toBeNull();
  expect(result.current.canViewOwnerDashboard).toBe(false);
});

it('로그아웃은 기기 비밀값 정리 실패에도 진행한다', async () => {
  const { result } = await login();
  (clearAttendanceDeviceCredentials as jest.Mock).mockResolvedValueOnce(false);
  await act(async () => { await result.current.signOut(); });
  expect(clearAttendanceDeviceCredentials).toHaveBeenCalledWith('user');
  expect(supabase.auth.signOut).toHaveBeenCalled();
  expect(result.current.user).toBeNull();
});
it('계정 교체와 SIGNED_OUT은 이전 사용자만 정리하고 토큰 갱신은 유지한다', async () => {
  await login();
  act(() => notify('TOKEN_REFRESHED', { user: { id: 'user' } }));
  expect(clearAttendanceDeviceCredentials).not.toHaveBeenCalled();
  act(() => notify('SIGNED_IN', { user: { id: 'next-user' } }));
  expect(clearAttendanceDeviceCredentials).toHaveBeenCalledWith('user');
  act(() => notify('SIGNED_OUT', null));
  expect(clearAttendanceDeviceCredentials).toHaveBeenCalledWith('next-user');
});
