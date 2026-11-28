import { act, renderHook, waitFor } from '@testing-library/react-native';
import { notifyManager } from '@tanstack/react-query';
import { queryClient as mockSharedQueryClient } from '../../lib/query/client';
import { resetFillPromptMemory, useStoreFillPrompt } from '../../lib/hooks/useStoreFillPrompt';

notifyManager.setScheduler(callback => callback());

const EMPTY = {
  id: 'store', payroll_close_day: null, payday_month_offset: null, payday_day: null, payday_holiday_rule: null,
  headcount_class: null, business_entity_type: null, vat_type: null, business_number: null,
  social_insurance_enrolled: null, industrial_accident_industry: null,
};
const FULL = {
  ...EMPTY, payroll_close_day: 0, payday_month_offset: 1, payday_day: 10, payday_holiday_rule: 'before',
  headcount_class: 'under_five', business_entity_type: 'individual', vat_type: 'general',
  social_insurance_enrolled: false,
};

let mockAuth: { user: { id: string }; store: { id: string; owner_id: string }; currentRole: 'admin' | 'member' };
let mockFill: Record<string, unknown> = EMPTY;
const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../lib/services/stores', () => ({
  getStoreFill: async () => mockFill,
  updateStoreFill: jest.fn(),
}));
jest.mock('../../lib/utils/secureStorageAdapter', () => ({
  secureStorageAdapter: { getItem: (...args: unknown[]) => mockGetItem(...args), setItem: (...args: unknown[]) => mockSetItem(...args) },
}));

beforeEach(() => {
  mockSharedQueryClient.clear();
  resetFillPromptMemory();
  jest.useFakeTimers({ advanceTimers: true });
  jest.setSystemTime(new Date('2026-12-07T03:00:00Z')); // KST 2026-12-07 12:00
  mockAuth = { user: { id: 'owner' }, store: { id: 'store', owner_id: 'owner' }, currentRole: 'admin' };
  mockFill = EMPTY;
  mockGetItem.mockReset().mockResolvedValue(null);
  mockSetItem.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { jest.useRealTimers(); });

test('사장님이 오늘 처음 열면 시트를 띄우고, 보인 뒤 오늘 날짜를 남긴다', async () => {
  const { result } = renderHook(() => useStoreFillPrompt('store', { active: true }));
  await waitFor(() => expect(result.current.shouldShowSheet).toBe(true));
  expect(result.current.canEdit).toBe(true);
  expect(result.current.alert).toEqual({ title: '급여 마감일·지급일을 정해 주세요', body: '정하면 월급날 3일 전과 당일에 알려 드릴게요' });
  act(() => { result.current.onSheetShown(); });
  expect(mockSetItem).toHaveBeenCalledWith('rattle.fillPrompt.store', '2026-12-07');
  act(() => { result.current.onLater(); });
  expect(result.current.shouldShowSheet).toBe(false);
  expect(result.current.alert).not.toBeNull();
});

test('오늘 이미 띄웠으면 다시 띄우지 않는다', async () => {
  mockGetItem.mockResolvedValue('2026-12-07');
  const { result } = renderHook(() => useStoreFillPrompt('store', { active: true }));
  await waitFor(() => expect(result.current.values).not.toBeNull());
  await act(async () => { await Promise.resolve(); });
  expect(mockGetItem).toHaveBeenCalledWith('rattle.fillPrompt.store');
  expect(result.current.shouldShowSheet).toBe(false);
});

test('어제 띄웠으면 오늘 다시 띄운다', async () => {
  mockGetItem.mockResolvedValue('2026-12-06');
  const { result } = renderHook(() => useStoreFillPrompt('store', { active: true }));
  await waitFor(() => expect(result.current.shouldShowSheet).toBe(true));
});

test('기록을 못 읽으면 띄우되 같은 실행에서는 다시 띄우지 않는다', async () => {
  mockGetItem.mockRejectedValue(new Error('keychain'));
  const first = renderHook(() => useStoreFillPrompt('store', { active: true }));
  await waitFor(() => expect(first.result.current.shouldShowSheet).toBe(true));
  first.unmount();
  const second = renderHook(() => useStoreFillPrompt('store', { active: true }));
  await waitFor(() => expect(second.result.current.values).not.toBeNull());
  await act(async () => { await Promise.resolve(); });
  expect(second.result.current.shouldShowSheet).toBe(false);
});

test('점장은 시트 없이 알림 카드만 받는다', async () => {
  mockAuth = { ...mockAuth, user: { id: 'manager' } };
  mockFill = { ...EMPTY, headcount_class: 'unknown' };
  const { result } = renderHook(() => useStoreFillPrompt('store', { active: true }));
  await waitFor(() => expect(result.current.values).not.toBeNull());
  expect(result.current.canEdit).toBe(false);
  expect(result.current.shouldShowSheet).toBe(false);
  expect(result.current.alert).toEqual({ title: '매장 정보를 마저 채워 주세요', body: '4개 중 1개 채웠어요' });
  expect(mockGetItem).not.toHaveBeenCalled();
});

test('직원·미리보기는 아무것도 읽지 않는다', async () => {
  mockAuth = { ...mockAuth, currentRole: 'member' };
  const { result } = renderHook(() => useStoreFillPrompt('store', { active: true }));
  await act(async () => { await Promise.resolve(); });
  expect(result.current).toMatchObject({ values: null, alert: null, paydayAlert: null, shouldShowSheet: false, loading: false });
});

test('화면이 비활성이면 시트를 띄우지 않는다', async () => {
  const { result } = renderHook(() => useStoreFillPrompt('store', { active: false }));
  await act(async () => { await Promise.resolve(); });
  expect(result.current.shouldShowSheet).toBe(false);
});

test('다 채우면 시트·알림이 없고, 지급일 3일 전엔 월급날 알림이 생긴다', async () => {
  mockFill = FULL;
  const { result } = renderHook(() => useStoreFillPrompt('store', { active: true }));
  await waitFor(() => expect(result.current.isComplete).toBe(true));
  expect(result.current.filledCount).toBe(4);
  expect(result.current.alert).toBeNull();
  expect(result.current.shouldShowSheet).toBe(false);
  expect(result.current.paydayAlert).toEqual({ kind: 'd3', title: '3일 뒤 월급날이에요', body: '12월 10일(목) · 11월 근무분' });
});

test('급여 날짜를 안 정했으면 월급날 알림이 없다', async () => {
  const { result } = renderHook(() => useStoreFillPrompt('store', { active: true }));
  await waitFor(() => expect(result.current.values).not.toBeNull());
  expect(result.current.paydayAlert).toBeNull();
});
