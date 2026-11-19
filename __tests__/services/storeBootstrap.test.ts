import { loadMyStores } from '../../lib/services/stores';
const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a), from: (...a: unknown[]) => mockFrom(...a) } }));
function table(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const name of ['select', 'eq', 'order']) chain[name] = () => chain;
  chain.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve);
  return chain;
}
const a = { id: 'a', owner_id: 'me', name: '본점' }, b = { id: 'b', owner_id: 'x', name: '남의 매장' };
beforeEach(() => { mockRpc.mockReset(); mockFrom.mockReset(); });
it('시작 RPC 한 번으로 매장·역할·재무 권한을 받고 개별 조회를 하지 않는다', async () => {
  mockRpc.mockResolvedValue({ data: [
    { store: a, member_role: null, financial_access: true },
    { store: b, member_role: 'member', financial_access: false },
  ], error: null });
  await expect(loadMyStores('me')).resolves.toEqual({ stores: [a, b], roles: { b: 'member' }, access: { a: true, b: false } });
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(mockRpc).toHaveBeenCalledWith('get_my_store_bootstrap');
  expect(mockFrom).not.toHaveBeenCalled();
});
it('시작 RPC가 아직 배포되지 않았을 때만 기존 조회로 같은 결과를 만든다', async () => {
  mockRpc.mockImplementation((name: string) => name === 'get_my_store_bootstrap'
    ? Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_my_store_bootstrap' } })
    : Promise.resolve({ data: [{ store_id: 'a', allowed: true }, { store_id: 'b', allowed: false }], error: null }));
  mockFrom.mockImplementation((name: string) => name === 'stores'
    ? table({ data: [a], error: null })
    : table({ data: [{ store_id: 'a', role: 'admin', stores: a }, { store_id: 'b', role: 'member', stores: b }], error: null }));
  await expect(loadMyStores('me')).resolves.toEqual({ stores: [a, b], roles: { a: 'admin', b: 'member' }, access: { a: true, b: false } });
});
it('권한 거절·네트워크 오류는 기존 조회로 우회하지 않는다', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } });
  await expect(loadMyStores('me')).rejects.toThrow('permission denied');
  expect(mockFrom).not.toHaveBeenCalled();
});
it('기존 조회에서 재무 권한 확인이 실패하면 매장은 보여 주되 권한은 모두 닫는다', async () => {
  mockRpc.mockImplementation((name: string) => Promise.resolve(name === 'get_my_store_bootstrap'
    ? { data: null, error: { code: 'PGRST202', message: 'missing' } } : { data: null, error: { message: 'offline' } }));
  mockFrom.mockImplementation((name: string) => table(name === 'stores' ? { data: [a], error: null } : { data: [], error: null }));
  await expect(loadMyStores('me')).resolves.toEqual({ stores: [a], roles: {}, access: {} });
});
