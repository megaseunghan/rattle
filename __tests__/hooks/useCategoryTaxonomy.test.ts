import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useCategoryTaxonomy } from '../../lib/hooks/useCategoryTaxonomy';

jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: { id: 's' } }) }));
jest.mock('../../lib/hooks/usePreviewWriteGuard', () => ({ usePreviewWriteGuard: () => ({ assertCanWrite: () => undefined }) }));

function makeTaxonomy() {
  return {
    getCategories: jest.fn(async () => ['식자재']),
    addCategory: jest.fn(async () => undefined),
    renameCategory: jest.fn(async () => undefined),
    removeCategory: jest.fn(async () => undefined),
    countByCategory: jest.fn(async () => 0),
  };
}

it('기본값은 마운트 때 한 번 조회한다', async () => {
  const taxonomy = makeTaxonomy();
  const { result } = renderHook(() => useCategoryTaxonomy(taxonomy));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(taxonomy.getCategories).toHaveBeenCalledTimes(1);
  expect(result.current.categories).toEqual(['식자재']);
});

it('fetchOnMount가 false면 마운트 때 조회하지 않고 refetch 한 번으로 채운다', async () => {
  const taxonomy = makeTaxonomy();
  const { result } = renderHook(() => useCategoryTaxonomy(taxonomy, { fetchOnMount: false }));
  expect(taxonomy.getCategories).not.toHaveBeenCalled();
  expect(result.current.loading).toBe(true);
  await act(async () => { await result.current.refetch(); });
  expect(taxonomy.getCategories).toHaveBeenCalledTimes(1);
  expect(result.current.loading).toBe(false);
  expect(result.current.categories).toEqual(['식자재']);
});
