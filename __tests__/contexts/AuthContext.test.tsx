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
