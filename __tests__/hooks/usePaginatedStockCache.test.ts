import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { queryClient } from '../../lib/query/client';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { useRecipes } from '../../lib/hooks/useRecipes';
beforeAll(() => notifyManager.setScheduler(callback => { void Promise.resolve().then(callback); }));
afterAll(() => notifyManager.setScheduler(callback => { setTimeout(callback, 0); }));
let mockUserId = 'u';
let mockStore: { id: string } | null = { id: 'a' };
const mockGetIngredients = jest.fn();
const mockGetRecipes = jest.fn();
const mockMutate = jest.fn();
const mockBatch = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: mockStore, user: { id: mockUserId } }) }));
jest.mock('../../lib/services/ingredients', () => ({ getIngredients: (...args: unknown[]) => mockGetIngredients(...args), updateIngredientCategories: (...args: unknown[]) => mockBatch(...args), createIngredient: (...args: unknown[]) => mockMutate(...args), deleteIngredient: (...args: unknown[]) => mockMutate(...args) }));
jest.mock('../../lib/services/recipes', () => ({ getRecipes: (...args: unknown[]) => mockGetRecipes(...args), updateRecipeCategories: (...args: unknown[]) => mockBatch(...args), createRecipeWithIngredients: (...args: unknown[]) => mockMutate(...args), deleteRecipe: (...args: unknown[]) => mockMutate(...args) }));
const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: queryClient }, children);
afterEach(async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); queryClient.clear(); }); });
beforeEach(() => { queryClient.clear(); mockUserId = 'u'; mockStore = { id: 'a' }; mockGetIngredients.mockReset(); mockGetRecipes.mockReset(); mockMutate.mockReset(); mockBatch.mockReset(); });
for (const [label, useHook, get] of [ ['ingredients', useIngredients, mockGetIngredients], ['recipes', useRecipes, mockGetRecipes] ] as const) {
  it(`${label}: a category mutation relies on its single service invalidation`, async () => {
    get.mockResolvedValue([{ id: 'one' }]);
    const { result } = renderHook(() => useHook(), { wrapper });
    await waitFor(() => expect(result.current.data.length).toBe(1));
    mockBatch.mockImplementation(async () => { await queryClient.invalidateQueries(); });
    await act(async () => { await result.current.bulkUpdateCategory(['one','two'],'new'); });
    expect(mockBatch).toHaveBeenCalledTimes(1);
    expect(mockBatch).toHaveBeenCalledWith('a',['one','two'],'new');
    expect(get).toHaveBeenCalledTimes(2);
  });
  it(`${label}: delete failure rolls back and a successful retry clears the error`, async () => {
    get.mockResolvedValue([{ id: 'one' }]);
    const { result } = renderHook(() => useHook(), { wrapper });
    await waitFor(() => expect(result.current.data.length).toBe(1));
    mockMutate.mockRejectedValueOnce(new Error('delete failed')).mockImplementationOnce(async () => {
      get.mockResolvedValue([]);
      await queryClient.invalidateQueries();
    });
    await act(async () => { await result.current.remove('one'); });
    await waitFor(() => expect(result.current.data.length).toBe(1));
    expect(result.current.error).toBeTruthy();
    await act(async () => { await result.current.remove('one'); });
    await waitFor(() => expect(result.current.data.length).toBe(0));
    expect(result.current.error).toBeNull();
    expect(get).toHaveBeenCalledTimes(2);
  });
  it(`${label}: another account cannot reuse this account's store cache`, async () => {
    get.mockResolvedValueOnce([{ id: 'user-u' }]).mockResolvedValueOnce([{ id: 'user-v' }]);
    const { result, rerender } = renderHook(() => useHook(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'user-u' }]));
    mockUserId = 'v'; rerender(false);
    expect(result.current.data).toEqual([]);
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'user-v' }]));
    expect(get).toHaveBeenCalledTimes(2);
  });
  it(`${label}: a late store A response cannot replace store B`, async () => {
    let done!: (rows: unknown[]) => void;
    get.mockImplementationOnce(() => new Promise(resolve => { done = resolve; })).mockResolvedValueOnce([{ id: 'b' }]);
    const { result, rerender } = renderHook(() => useHook(), { wrapper });
    mockStore = { id: 'b' }; rerender(false);
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'b' }]));
    await act(async () => { done([{ id: 'a' }]); });
    expect(result.current.data).toEqual([{ id: 'b' }]);
  });
  it(`${label}: reentry uses shared cache and manual refresh bypasses freshness`, async () => {
    get.mockResolvedValue([{ id: 'a' }]);
    const first = renderHook(() => useHook(), { wrapper });
    await waitFor(() => expect(first.result.current.data).toEqual([{ id: 'a' }]));
    const second = renderHook(() => useHook(), { wrapper });
    await act(async () => { await second.result.current.refetch(false); });
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => { await second.result.current.refetch(); });
    expect(get).toHaveBeenCalledTimes(2);
    mockStore = null; second.rerender(false);
    expect(second.result.current.data).toEqual([]);
    expect(second.result.current.loading).toBe(false);
  });
  it(`${label}: pagination requests page one once and invalidation refreshes active observers`, async () => {
    const page = Array.from({ length: 20 }, (_, i) => ({ id: String(i) }));
    get.mockResolvedValueOnce(page).mockResolvedValueOnce([{ id: 'last' }]).mockResolvedValue(page);
    const { result } = renderHook(() => useHook(), { wrapper });
    await waitFor(() => expect(result.current.data.length).toBe(20));
    await act(async () => { await result.current.loadMore(); });
    await waitFor(() => expect(result.current.data.length).toBe(21)); expect(get).toHaveBeenNthCalledWith(2,'a',1,20);
    expect(result.current.hasMore).toBe(false);
    await act(async () => { await queryClient.invalidateQueries(); });
    expect(get.mock.calls.length).toBeGreaterThan(2);
  });
}
