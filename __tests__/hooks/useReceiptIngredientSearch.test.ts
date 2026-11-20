import { act, renderHook } from '@testing-library/react-native';
import { useReceiptIngredientSearch } from '../../lib/hooks/useReceiptIngredientSearch';
import { getIngredients } from '../../lib/services/ingredients';
import type { Ingredient } from '../../types';

jest.mock('../../lib/services/ingredients', () => ({ getIngredients: jest.fn() }));
const fetchPage = jest.mocked(getIngredients);
const empty: Ingredient[] = [];
const rice = { id: 'rice', name: '쌀', unit: 'kg' } as Ingredient;
const tick = () => act(async () => { await jest.advanceTimersByTimeAsync(200); });
beforeEach(() => { jest.useFakeTimers(); fetchPage.mockReset(); });
afterEach(() => jest.useRealTimers());

it('입력을 묶고 검색어나 매장이 바뀌면 이전 요청과 늦은 응답을 폐기한다', async () => {
  let stale!: (rows: Ingredient[]) => void;
  fetchPage.mockImplementationOnce(() => new Promise(resolve => { stale = resolve; }))
    .mockResolvedValueOnce([rice]);
  const hook = renderHook(({ store, term }: { store: string; term: string }) => useReceiptIngredientSearch(store, term, empty, false),
    { initialProps: { store: 'old', term: '가' } });
  hook.rerender({ store: 'old', term: '가상' });
  await tick();
  expect(fetchPage).toHaveBeenCalledTimes(1);
  const signal = fetchPage.mock.calls[0][3];
  hook.rerender({ store: 'new', term: '쌀' });
  expect(signal?.aborted).toBe(true);
  await tick();
  await act(async () => stale([]));
  expect(hook.result.current.result?.matches).toEqual([rice]);
  expect(fetchPage.mock.calls[1].slice(0, 3)).toEqual(['new', 0, 100]);
});

it('목록 뒷페이지까지 검색하고 같은 매장 목록을 로컬에서 재사용한다', async () => {
  fetchPage.mockResolvedValueOnce(Array(100).fill({ id: 'other', name: '가상' })).mockResolvedValueOnce([rice]);
  const hook = renderHook(({ term }: { term: string }) => useReceiptIngredientSearch('store', term, empty, false),
    { initialProps: { term: '쌀' } });
  await tick();
  expect(hook.result.current.result?.matches).toEqual([rice]);
  hook.rerender({ term: '없는 품목' });
  expect(hook.result.current.result).toBeUndefined();
  await tick();
  expect(hook.result.current.result?.matches).toEqual([]);
  expect(fetchPage).toHaveBeenCalledTimes(2);
});
