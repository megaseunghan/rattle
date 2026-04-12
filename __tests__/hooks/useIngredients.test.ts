import { renderHook, act } from '@testing-library/react-native';
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

describe('useIngredients 훅', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetIngredients.mockResolvedValue([sampleIngredient]);
  });

  it('마운트 시 식자재 목록을 불러온다', async () => {
    const { result } = renderHook(() => useIngredients());

    expect(result.current.loading).toBe(true);

    await act(async () => {});

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([sampleIngredient]);
    expect(mockGetIngredients).toHaveBeenCalledWith('store-123', 0, 20);
  });

  it('remove 시 optimistic delete로 즉시 UI에서 제거된다', async () => {
    const { result } = renderHook(() => useIngredients());
    await act(async () => {});

    mockDeleteIngredient.mockResolvedValue(undefined);

    act(() => {
      result.current.remove('ing-1');
    });

    // 즉시 제거됨 (optimistic)
    expect(result.current.data).toEqual([]);
  });

  it('remove 실패 시 데이터를 복원한다', async () => {
    const { result } = renderHook(() => useIngredients());
    await act(async () => {});

    mockDeleteIngredient.mockRejectedValue(new Error('삭제 실패'));

    await act(async () => {
      await result.current.remove('ing-1');
    });

    // 복원됨
    expect(result.current.data).toEqual([sampleIngredient]);
    expect(result.current.error).toBe('삭제 실패');
  });

  it('서비스 에러 발생 시 error 상태를 설정한다', async () => {
    mockGetIngredients.mockRejectedValue(new Error('네트워크 오류'));

    const { result } = renderHook(() => useIngredients());
    await act(async () => {});

    expect(result.current.error).toBe('네트워크 오류');
    expect(result.current.data).toEqual([]);
  });
});
