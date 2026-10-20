import { act, renderHook } from '@testing-library/react-native';
import { useEmployees } from '../../lib/hooks/useEmployees';
const mockGet = jest.fn();
let mockStore: { id: string } | null = { id: 'a' };
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: mockStore }) }));
jest.mock('../../lib/services/employees', () => ({ getEmployees: (...args: unknown[]) => mockGet(...args) }));
jest.mock('../../lib/services/wageHistory', () => ({ seedInitialWage: jest.fn() }));
beforeEach(() => { mockGet.mockReset(); mockStore = { id: 'a' }; });

it('이전 매장 직원 조회가 늦게 끝나도 현재 매장 목록을 바꾸지 않는다', async () => {
  let done!: (value: unknown) => void;
  mockGet.mockImplementationOnce(() => new Promise(resolve => { done = resolve; })).mockResolvedValueOnce([{ id: 'employee-b' }]);
  const { result, rerender } = renderHook(useEmployees);
  let old!: Promise<void>;
  act(() => { old = result.current.refetch(); });
  mockStore = { id: 'b' }; rerender(false);
  await act(async () => { await result.current.refetch(); });
  await act(async () => { done([{ id: 'employee-a' }]); await old; });
  expect(result.current.employees).toEqual([{ id: 'employee-b' }]);
});
it('매장이 없는 상태에서는 이전 직원 목록을 비운다', async () => {
  mockGet.mockResolvedValue([{ id: 'employee-a' }]);
  const { result, rerender } = renderHook(useEmployees);
  await act(async () => { await result.current.refetch(); });
  mockStore = null; rerender(false);
  await act(async () => { await result.current.refetch(); });
  expect(result.current.employees).toEqual([]);
  expect(result.current.loading).toBe(false);
});
