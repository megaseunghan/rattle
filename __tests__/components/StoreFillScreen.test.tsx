import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { notifyManager } from '@tanstack/react-query';
import { queryClient as mockSharedQueryClient } from '../../lib/query/client';
import { StoreFillScreen } from '../../lib/components/store-fill/StoreFillScreen';

notifyManager.setScheduler(callback => callback());

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 34 }), SafeAreaView: View };
});
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('../../lib/components/ui/SheetModal', () => ({ SheetModal: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null) }));
jest.mock('expo-router', () => ({ router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn() } }));

const EMPTY = {
  id: 'store', payroll_close_day: null, payday_month_offset: null, payday_day: null, payday_holiday_rule: null,
  headcount_class: null, business_entity_type: null, vat_type: null, business_number: null,
  social_insurance_enrolled: null, industrial_accident_industry: null,
};
let mockAuth: { user: { id: string }; store: { id: string; owner_id: string }; currentRole: 'admin' | 'member' };
let mockFill: Record<string, unknown> = EMPTY;
const mockUpdate = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../lib/services/stores', () => ({
  getStoreFill: async () => mockFill,
  updateStoreFill: (...args: unknown[]) => mockUpdate(...args),
}));
jest.mock('../../lib/services/industrialAccident', () => ({
  getIndustrialAccidentIndustries: async () => [{ code: 'retail_food_lodging', name: '도소매·음식·숙박업', sort_order: 1 }, { code: 'unlisted', name: '목록에 없어요', sort_order: 999 }],
}));
jest.mock('../../lib/services/attendance', () => ({
  getAttendancePunches: async () => ({ status: 'success', data: { rows: [], nextOffset: null } }),
}));

beforeEach(() => {
  mockSharedQueryClient.clear();
  mockAuth = { user: { id: 'owner' }, store: { id: 'store', owner_id: 'owner' }, currentRole: 'admin' };
  mockFill = EMPTY;
  mockUpdate.mockReset().mockImplementation(async (_id: string, patch: Record<string, unknown>) => {
    mockFill = { ...mockFill, ...patch };
    return mockFill;
  });
});

test('사장님: 안 정한 줄을 눌러 고르면 바로 저장하고 진행이 오른다', async () => {
  render(<StoreFillScreen />);
  expect(await screen.findByText('4개 중 0개')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('상시 근로자, 아직 안 정했어요'));
  fireEvent.press(screen.getByText('5인 미만'));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('store', { headcount_class: 'under_five' }));
  expect(await screen.findByText('4개 중 1개')).toBeTruthy();
  expect(screen.getByText('저장했어요')).toBeTruthy();
});

test('4대보험 가입했어요를 고르면 업종 시트가 이어지고, 업종까지 골라야 완료다', async () => {
  jest.useFakeTimers({ advanceTimers: true });
  render(<StoreFillScreen />);
  fireEvent.press(await screen.findByLabelText('4대보험 가입, 아직 안 정했어요'));
  fireEvent.press(screen.getByText('가입했어요'));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('store', { social_insurance_enrolled: true }));
  expect(screen.getByText('4개 중 0개')).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(500); });
  fireEvent.press(await screen.findByText('도소매·음식·숙박업'));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('store', { industrial_accident_industry: 'retail_food_lodging' }));
  expect(await screen.findByText('4개 중 1개')).toBeTruthy();
  jest.useRealTimers();
});

test('목록에 없어요는 서버 업종 코드로 저장하고 4대보험 묶음을 채운 것으로 센다', async () => {
  mockFill = { ...EMPTY, social_insurance_enrolled: true };
  mockUpdate.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({ ...mockFill, ...patch }));
  render(<StoreFillScreen />);
  fireEvent.press(await screen.findByLabelText('산재보험 업종, 아직 안 정했어요'));
  expect(await screen.findAllByText('목록에 없어요')).toHaveLength(1);  // 서버 목록의 같은 항목과 겹치지 않는다
  fireEvent.press(screen.getByText('목록에 없어요'));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('store', { industrial_accident_industry: 'unlisted' }));
  expect(await screen.findByLabelText('산재보험 업종, 목록에 없어요')).toBeTruthy();
  expect(screen.getByText('4개 중 1개')).toBeTruthy();
  expect(screen.getByText('목록에 없는 업종이면 손익에 산재보험을 넣지 않아요.')).toBeTruthy();
});

test('저장 실패는 시트 안에 안내하고 진행을 올리지 않는다', async () => {
  mockUpdate.mockRejectedValue(new Error('STORE_FILL_OWNER_REQUIRED raw'));
  render(<StoreFillScreen />);
  fireEvent.press(await screen.findByLabelText('상시 근로자, 아직 안 정했어요'));
  fireEvent.press(screen.getByText('5인 이상'));
  expect(await screen.findByText('저장하지 못했어요. 다시 시도해 주세요.')).toBeTruthy();
  expect(screen.getByText('4개 중 0개')).toBeTruthy();
});

test('점장은 보기만 하고 시트를 열 수 없다', async () => {
  mockAuth = { ...mockAuth, user: { id: 'manager' } };
  render(<StoreFillScreen />);
  expect(await screen.findByText('사장님이 정한 정보예요. 바꾸려면 사장님께 말씀해 주세요.')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('상시 근로자, 아직 안 정했어요'));
  expect(screen.queryByText('5인 미만')).toBeNull();
});

test('관리자가 아니면 그리지 않는다', () => {
  mockAuth = { ...mockAuth, currentRole: 'member' };
  render(<StoreFillScreen />);
  expect(screen.queryByText('매장 정보 마저 채우기')).toBeNull();
});
