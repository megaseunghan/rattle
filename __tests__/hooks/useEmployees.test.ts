import { createElement, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { invalidateStoreData, queryClient } from '../../lib/query/client';

const mockGet = jest.fn();
const mockCreate = jest.fn();
let mockStore: { id: string } | null = { id: 'a' };
let mockIdentity = { user: { id: 'user-a' }, realRole: 'owner', currentRole: 'owner', devPreviewMode: 'self', devPreviewEmployeeId: null, memberRoles: {} };
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: mockStore, ...mockIdentity }) }));
jest.mock('../../lib/services/employees', () => ({
  getEmployees: (...args: unknown[]) => mockGet(...args),
  createEmployee: (...args: unknown[]) => mockCreate(...args),
}));
const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

beforeEach(() => {
  queryClient.clear(); mockGet.mockReset(); mockCreate.mockReset(); mockStore = { id: 'a' };
  mockIdentity = { user: { id: 'user-a' }, realRole: 'owner', currentRole: 'owner', devPreviewMode: 'self', devPreviewEmployeeId: null, memberRoles: {} };
});
afterEach(() => { queryClient.clear(); });

it('이전 매장 직원 조회가 늦게 끝나도 현재 매장 목록을 바꾸지 않는다', async () => {
  const first = deferred<unknown[]>();
  mockGet.mockImplementationOnce(() => first.promise).mockResolvedValueOnce([{ id: 'employee-b' }]);
  const { result, rerender } = renderHook(() => useEmployees(), { wrapper });
  await waitFor(() => expect(mockGet).toHaveBeenCalledWith('a', false));
  mockStore = { id: 'b' }; rerender({});
  await waitFor(() => expect(result.current.employees).toEqual([{ id: 'employee-b' }]));
  await act(async () => { first.resolve([{ id: 'employee-a' }]); await first.promise; });
  expect(result.current.employees).toEqual([{ id: 'employee-b' }]);
});
it('매장이 없는 상태에서는 이전 직원 목록을 비운다', async () => {
  mockGet.mockResolvedValue([{ id: 'employee-a' }]);
  const { result, rerender } = renderHook(() => useEmployees(), { wrapper });
  await waitFor(() => expect(result.current.employees).toEqual([{ id: 'employee-a' }]));
  mockStore = null; rerender({});
  await act(async () => { await result.current.refetch(); });
  await waitFor(() => expect(result.current.employees).toEqual([]));
  expect(result.current.loading).toBe(false);
  expect(mockGet).toHaveBeenCalledTimes(1);
});
it('같은 계정·권한·매장의 직원 목록을 보는 화면은 진행 중 요청을 공유한다', async () => {
  const request = deferred<unknown[]>(); mockGet.mockReturnValue(request.promise);
  const { result } = renderHook(() => ({ first: useEmployees(), second: useEmployees() }), { wrapper });
  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
  await act(async () => { request.resolve([{ id: 'employee-a' }]); await request.promise; });
  await waitFor(() => expect(result.current.first.employees).toEqual([{ id: 'employee-a' }]));
  expect(result.current.second.employees).toEqual([{ id: 'employee-a' }]);
  expect(mockGet).toHaveBeenCalledTimes(1);
});
it('서비스가 생성 후 목록을 갱신하면 같은 직원을 로컬에서 다시 추가하지 않는다', async () => {
  mockGet.mockResolvedValueOnce([]).mockResolvedValue([{ id: 'created' }]);
  mockCreate.mockImplementation(async () => { await invalidateStoreData('a'); return { id: 'created' }; });
  const { result } = renderHook(() => useEmployees(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await result.current.add({ name: '직원', employment_type: 'regular', base_salary: 3000000, non_taxable: 0, dependents: 1 }); });
  await waitFor(() => expect(result.current.employees).toEqual([{ id: 'created' }]));
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockGet).toHaveBeenCalledTimes(2);
});
it.each(['account', 'role'] as const)('%s 변경 시 같은 매장도 이전 권한의 캐시를 사용하지 않는다', async kind => {
  const next = deferred<unknown[]>();
  mockGet.mockResolvedValueOnce([{ id: 'old-visible-employee' }]).mockReturnValueOnce(next.promise);
  const { result, rerender } = renderHook(() => useEmployees(), { wrapper });
  await waitFor(() => expect(result.current.employees).toEqual([{ id: 'old-visible-employee' }]));
  mockIdentity = kind === 'account' ? { ...mockIdentity, user: { id: 'user-b' } }
    : { ...mockIdentity, realRole: 'member', currentRole: 'member' };
  rerender({});
  expect(result.current.employees).toEqual([]);
  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  await act(async () => { next.resolve([{ id: 'new-visible-employee' }]); await next.promise; });
  await waitFor(() => expect(result.current.employees).toEqual([{ id: 'new-visible-employee' }]));
});
