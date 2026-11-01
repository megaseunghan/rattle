import { act, renderHook, waitFor } from '@testing-library/react-native';
import { notifyManager } from '@tanstack/react-query';
import { useCleaningChecklist } from '../../lib/hooks/useCleaningChecklist';
import { clearQueryData } from '../../lib/query/client';

const mockList = jest.fn(), mockLogs = jest.fn(), mockAdd = jest.fn();
let mockStoreId = 'store-a';
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({
  store: { id: mockStoreId }, user: { id: 'admin' }, realRole: 'admin', currentRole: 'admin', devPreviewMode: 'self',
}) }));
jest.mock('../../lib/services/cleaning', () => ({
  listCleaningItems: (...args: unknown[]) => mockList(...args),
  listCleaningLogsByDate: (...args: unknown[]) => mockLogs(...args),
  addCleaningItem: (...args: unknown[]) => mockAdd(...args),
  updateCleaningItem: jest.fn(), removeCleaningItem: jest.fn(), reorderCleaningItems: jest.fn(),
  checkCleaningItem: jest.fn(), uncheckCleaningItem: jest.fn(),
}));
const weekdayItem = { id: 'new', store_id: 'store-a', segment: 'weekday', weekday: 3, title: '수요일 필터 청소', sort_order: 0 };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeAll(() => { notifyManager.setNotifyFunction(callback => { act(() => callback()); }); });
afterAll(() => { notifyManager.setNotifyFunction(callback => callback()); });
beforeEach(async () => {
  await act(async () => { await clearQueryData(); });
  mockStoreId = 'store-a';
  mockList.mockReset().mockResolvedValue([]);
  mockLogs.mockReset().mockResolvedValue([]);
  mockAdd.mockReset().mockResolvedValue(weekdayItem);
});
afterEach(async () => { await act(async () => { await clearQueryData(); }); });

it('요일별 추가가 편집창과 이미 열린 체크리스트에 함께 반영된다', async () => {
  const editor = renderHook(() => useCleaningChecklist());
  const checklist = renderHook(() => useCleaningChecklist());
  await waitFor(() => expect(editor.result.current.loading).toBe(false));
  expect(mockList).toHaveBeenCalledTimes(1);
  await act(async () => { await editor.result.current.addItem('weekday', weekdayItem.title, 3); });
  await waitFor(() => expect(checklist.result.current.items).toEqual([weekdayItem]));
  expect(editor.result.current.items).toEqual([weekdayItem]);
  expect(mockAdd).toHaveBeenCalledWith('store-a', 'weekday', weekdayItem.title, 0, 3);
});

it('추가 전에 시작한 느린 조회가 추가 완료 뒤 새 항목을 지우지 않는다', async () => {
  const hook = renderHook(() => useCleaningChecklist());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  const oldRead = deferred<never[]>();
  mockList.mockReturnValueOnce(oldRead.promise);
  let refreshing!: Promise<void>;
  act(() => { refreshing = hook.result.current.refetch(); });
  await act(async () => { await hook.result.current.addItem('weekday', weekdayItem.title, 3); });
  await act(async () => { oldRead.resolve([]); await refreshing; });
  await waitFor(() => expect(hook.result.current.items).toEqual([weekdayItem]));
});

it('매장 전환 중 끝난 추가는 다른 매장 목록에 섞이지 않는다', async () => {
  const pending = deferred<typeof weekdayItem>();
  mockAdd.mockReturnValueOnce(pending.promise);
  const hook = renderHook(() => useCleaningChecklist());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  let saving!: ReturnType<typeof hook.result.current.addItem>;
  act(() => { saving = hook.result.current.addItem('weekday', weekdayItem.title, 3); });
  mockStoreId = 'store-b'; hook.rerender({});
  await act(async () => { pending.resolve(weekdayItem); await saving; });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  expect(hook.result.current.items).toEqual([]);
});

it('저장 실패는 항목을 만든 것처럼 표시하지 않는다', async () => {
  mockAdd.mockRejectedValueOnce(new Error('저장 거절'));
  const hook = renderHook(() => useCleaningChecklist());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => { await expect(hook.result.current.addItem('weekday', '실패 항목', 3)).rejects.toThrow('저장 거절'); });
  expect(hook.result.current.items).toEqual([]);
});

it('목록 첫 조회 실패 상태에서 새 항목 하나만 정상 목록으로 만들지 않는다', async () => {
  mockList.mockRejectedValueOnce(new Error('목록 조회 실패'));
  const hook = renderHook(() => useCleaningChecklist());
  await waitFor(() => expect(hook.result.current.error).toBeTruthy());
  expect(hook.result.current.itemsReady).toBe(false);
  await act(async () => { await expect(hook.result.current.addItem('weekday', '추가 보류', 3)).rejects.toThrow('먼저 불러온'); });
  expect(mockAdd).not.toHaveBeenCalled();
  expect(hook.result.current.items).toEqual([]);
});
it('완료 로그 조회 실패를 미완료로 단정하거나 체크 쓰기로 우회하지 않는다', async () => {
  mockList.mockResolvedValueOnce([weekdayItem]); mockLogs.mockRejectedValueOnce(new Error('logs offline'));
  const hook=renderHook(()=>useCleaningChecklist()); await waitFor(()=>expect(hook.result.current.error).toBeTruthy());
  await act(async()=>{await expect(hook.result.current.toggle(weekdayItem as any,'QA')).rejects.toThrow('다시 불러온');});
  expect(require('../../lib/services/cleaning').checkCleaningItem).not.toHaveBeenCalled();
});
it('체크 응답 유실은 재조회 전 반복 쓰기를 차단하고 결과를 확인한 뒤 복구한다', async () => {
  mockList.mockResolvedValue([weekdayItem]);
  const write=require('../../lib/services/cleaning').checkCleaningItem as jest.Mock; write.mockReset().mockRejectedValueOnce(new Error('lost'));
  const hook=renderHook(()=>useCleaningChecklist()); await waitFor(()=>expect(hook.result.current.loading).toBe(false));
  await act(async()=>{await expect(hook.result.current.toggle(weekdayItem as any,'QA')).rejects.toThrow('체크 결과');});
  expect(hook.result.current.error).toContain('체크 결과');
  await act(async()=>{await hook.result.current.toggle(weekdayItem as any,'QA');}); expect(write).toHaveBeenCalledTimes(1);
  mockLogs.mockResolvedValueOnce([{id:'log',item_id:weekdayItem.id,checked_by_name:'QA'}]);
  await act(async()=>{await hook.result.current.refetch();}); await waitFor(()=>expect(hook.result.current.error).toBeNull());
  expect(hook.result.current.logs).toHaveLength(1);
});
