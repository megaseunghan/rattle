import { renderHook as renderBaseHook, act, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../lib/query/client';
const renderHook = (hook: () => ReturnType<typeof useIngredients>) => renderBaseHook(hook, { wrapper: ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: queryClient }, children) });
import { useIngredients } from '../../lib/hooks/useIngredients';

// AuthContext mock — store 객체를 factory 내부에서 고정해 참조 안정성 보장 (무한 루프 방지)
jest.mock('../../lib/contexts/AuthContext', () => {
  const store = { id: 'store-123', name: '테스트 매장' };
  return { useAuth: () => ({ store }) };
});

// 서비스 mock
const mockGetIngredients = jest.fn();
const mockCreateIngredient = jest.fn();
const mockUpdateIngredient = jest.fn();
const mockDeleteIngredient = jest.fn();

jest.mock('../../lib/services/ingredients', () => ({
  getIngredients: (...args: any[]) => mockGetIngredients(...args),
  createIngredient: (...args: any[]) => mockCreateIngredient(...args),
  updateIngredient: (...args: any[]) => mockUpdateIngredient(...args),
  deleteIngredient: (...args: any[]) => mockDeleteIngredient(...args),
}));

const sampleIngredient = {
  id: 'ing-1',
  store_id: 'store-123',
  name: '원두',
  category: '음료재료',
  current_stock: 10,
  unit: 'kg',
  min_stock: 2,
  last_price: 30000,
  updated_at: '',
  created_at: '',
};

afterEach(() => queryClient.clear());
describe('useIngredients 훅', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGetIngredients.mockResolvedValue([sampleIngredient]);
  });

  it('마운트 시 식자재 목록을 불러온다', async () => {
    const { result } = renderHook(() => useIngredients());

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([sampleIngredient]);
    expect(mockGetIngredients).toHaveBeenCalledWith('store-123', 0, 20);
  });

  it('remove 시 optimistic delete로 즉시 UI에서 제거된다', async () => {
    const { result } = renderHook(() => useIngredients());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let finish!: () => void;
    mockDeleteIngredient.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));

    act(() => {
      result.current.remove('ing-1');
    });

    // 즉시 제거됨 (optimistic)
    await waitFor(() => expect(result.current.data).toEqual([]));
    mockGetIngredients.mockResolvedValue([]);
    await act(async () => { finish(); });
  });

  it('remove 실패 시 데이터를 복원한다', async () => {
    const { result } = renderHook(() => useIngredients());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockDeleteIngredient.mockRejectedValue(new Error('삭제 실패'));

    await act(async () => {
      await result.current.remove('ing-1');
    });

    // 복원됨
    expect(result.current.data).toEqual([sampleIngredient]);
    expect(result.current.error).toBe('처리하지 못했어요. 다시 시도해주세요.');
  });

  it('서비스 에러 발생 시 error 상태를 설정한다', async () => {
    mockGetIngredients.mockRejectedValue(new Error('네트워크 오류'));

    const { result } = renderHook(() => useIngredients());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('처리하지 못했어요. 다시 시도해주세요.');
    expect(result.current.data).toEqual([]);
  });
});
