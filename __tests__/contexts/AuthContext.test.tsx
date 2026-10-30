import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../../lib/query/client';
import { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../../lib/contexts/AuthContext';
import { supabase } from '../../lib/supabase';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(),
}));
jest.mock('../../lib/supabase', () => ({ supabase: {
  from: jest.fn(), auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
} }));

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
});

it('매장 선택은 서버 재조회를 기다리지 않고 불러온 목록으로 전환한다', async () => {
  const { result } = await login();
  (supabase.from as jest.Mock).mockClear();
  await act(async () => { await result.current.switchStore('b'); });
  expect(result.current.store?.id).toBe('b');
  expect(supabase.from).not.toHaveBeenCalled();
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
