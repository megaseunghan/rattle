import { act, renderHook } from '@testing-library/react-native';
import { useExpenseCategoryExpansion } from '../../lib/hooks/useExpenseCategoryExpansion';
import { setExpenseCategorySession } from '../../lib/utils/expenseCategorySession';

beforeEach(() => { setExpenseCategorySession(null); setExpenseCategorySession('u'); });
afterEach(() => { setExpenseCategorySession(null); });

test('starts collapsed, keeps independent choices across remount and store switches', () => {
  const first = renderHook(({ store }: { store: string }) => useExpenseCategoryExpansion('u', store), { initialProps: { store: 'a' } });
  expect(first.result.current.expanded).toEqual({});
  act(() => first.result.current.toggle('고정비'));
  act(() => first.result.current.toggle('공과금'));
  act(() => first.result.current.toggle('고정비'));
  expect(first.result.current.expanded).toEqual({ 고정비: false, 공과금: true });
  first.rerender({ store: 'b' });
  expect(first.result.current.expanded).toEqual({});
  act(() => first.result.current.toggle('마케팅'));
  first.rerender({ store: 'a' });
  expect(first.result.current.expanded).toEqual({ 고정비: false, 공과금: true });
  first.unmount();
  const next = renderHook(() => useExpenseCategoryExpansion('u', 'a'));
  expect(next.result.current.expanded).toEqual({ 고정비: false, 공과금: true });
});

test('same user token refresh preserves choices, logout and new login clear them', () => {
  const { result } = renderHook(() => useExpenseCategoryExpansion('u', 's'));
  act(() => result.current.toggle('고정비'));
  act(() => setExpenseCategorySession('u'));
  expect(result.current.expanded.고정비).toBe(true);
  act(() => setExpenseCategorySession(null));
  expect(result.current.expanded).toEqual({});
  act(() => result.current.toggle('고정비'));
  act(() => setExpenseCategorySession('u'));
  expect(result.current.expanded).toEqual({});
});

test('account switch clears previous account preferences and rejects stale callbacks', () => {
  const old = renderHook(() => useExpenseCategoryExpansion('u', 's'));
  act(() => old.result.current.toggle('고정비'));
  act(() => setExpenseCategorySession('other'));
  const next = renderHook(() => useExpenseCategoryExpansion('other', 's'));
  expect(next.result.current.expanded).toEqual({});
  act(() => old.result.current.toggle('공과금'));
  expect(next.result.current.expanded).toEqual({});
  act(() => setExpenseCategorySession('u'));
  expect(old.result.current.expanded).toEqual({});
});
