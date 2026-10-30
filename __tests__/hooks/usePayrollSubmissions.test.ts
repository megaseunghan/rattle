import { act, renderHook } from '@testing-library/react-native';
import { usePayrollSubmissions } from '../../lib/hooks/usePayrollSubmissions';
import { getPayrollSubmissions } from '../../lib/services/payrollSubmissions';

jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user' }, store: { id: 'store' } }) }));
jest.mock('../../lib/services/payrollSubmissions', () => ({ getPayrollSubmissions: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

it('재조회 실패를 false로 반환해 제출 성공과 조회 실패를 구분할 수 있게 한다', async () => {
  (getPayrollSubmissions as jest.Mock).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('network'));
  const { result } = renderHook(() => usePayrollSubmissions('2026-10', 'employee'));
  await act(async () => { await result.current.refetch(); });
  let success: boolean | undefined;
  await act(async () => { success = await result.current.refetch(); });
  expect(success).toBe(false);
  expect(result.current.error).toBe('근무시간 제출 내역을 불러오지 못했어요. 다시 시도해주세요.');
});

it('재조회 성공 시 true와 새 제출 버전을 반환한다', async () => {
  (getPayrollSubmissions as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'new', version: 2 }]);
  const { result } = renderHook(() => usePayrollSubmissions('2026-10', 'employee'));
  await act(async () => { await result.current.refetch(); });
  let success: boolean | undefined;
  await act(async () => { success = await result.current.refetch(); });
  expect(success).toBe(true);
  expect(result.current.rows).toEqual([{ id: 'new', version: 2 }]);
});
