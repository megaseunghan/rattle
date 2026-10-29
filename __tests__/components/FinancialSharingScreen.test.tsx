import { render, fireEvent, waitFor } from '@testing-library/react-native';
import FinancialSharingScreen from '../../app/settings/financial-sharing';
import { updateFinancialSharing } from '../../lib/services/stores';
const mockRefresh = jest.fn();
let mockOwner = true;
let mockScope = 'all_staff';
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('../../lib/hooks/useConfirmLeave', () => ({ useConfirmLeave: jest.fn() }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: { id: 's', name: '검증 매장', owner_id: 'owner', financial_share_scope: mockScope }, user: { id: mockOwner ? 'owner' : 'member' }, devPreviewMode: 'self', refreshStore: mockRefresh }) }));
jest.mock('../../lib/services/stores', () => ({ updateFinancialSharing: jest.fn() }));
jest.mock('../../lib/query/client', () => ({ clearQueryData: jest.fn().mockResolvedValue(undefined) }));
beforeEach(() => { jest.clearAllMocks(); mockOwner = true; mockScope = 'all_staff'; mockRefresh.mockResolvedValue(undefined); (updateFinancialSharing as jest.Mock).mockResolvedValue(undefined); });
it('현재 적용 범위는 표시하고 바꾸지 않은 설정은 저장하지 않는다', () => {
  const view = render(<FinancialSharingScreen />);
  expect(view.getByText('검증 매장')).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: '공유 설정 저장' }));
  expect(updateFinancialSharing).not.toHaveBeenCalled();
});
it('저장 후 새로고침 실패는 저장 실패로 표시하지 않고 재저장을 막는다', async () => {
  mockRefresh.mockRejectedValue(new Error('refresh failed'));
  const view = render(<FinancialSharingScreen />);
  fireEvent.press(view.getByRole('radio', { name: '공유하지 않기' }));
  fireEvent.press(view.getByRole('button', { name: '공유 설정 저장' }));
  await waitFor(() => expect(view.getByText(/설정은 저장됐어요/)).toBeTruthy());
  expect(updateFinancialSharing).toHaveBeenCalledWith('s', 'none');
  fireEvent.press(view.getByRole('button', { name: '공유 설정 저장' }));
  expect(updateFinancialSharing).toHaveBeenCalledTimes(1);
});
it('저장이 거절되면 선택을 유지하고 다시 시도할 수 있다', async () => {
  (updateFinancialSharing as jest.Mock).mockRejectedValue(new Error('rejected'));
  const view = render(<FinancialSharingScreen />);
  fireEvent.press(view.getByRole('radio', { name: '직원에게만 공유' }));
  fireEvent.press(view.getByRole('button', { name: '공유 설정 저장' }));
  await waitFor(() => expect(view.getByText(/선택한 내용을 유지/)).toBeTruthy());
  expect(view.getByRole('radio', { name: '직원에게만 공유' }).props.accessibilityState.checked).toBe(true);
  expect(view.getByRole('button', { name: '공유 설정 저장' }).props.accessibilityState.disabled).toBe(false);
});
it('소유자가 아니면 변경 폼을 제공하지 않는다', () => {
  mockOwner = false;
  const view = render(<FinancialSharingScreen />);
  expect(view.queryByRole('radio')).toBeNull();
  expect(view.getByText('매장 소유자만 공유 대상을 변경할 수 있어요.')).toBeTruthy();
});

it('저장한 범위가 AuthContext에 반영돼도 완료 안내를 유지한다', async () => {
  mockRefresh.mockImplementation(async () => { mockScope = 'none'; });
  const view = render(<FinancialSharingScreen />);
  fireEvent.press(view.getByRole('radio', { name: '공유하지 않기' }));
  fireEvent.press(view.getByRole('button', { name: '공유 설정 저장' }));
  await waitFor(() => expect(view.getByText('적용 중 · 공유하지 않기')).toBeTruthy());
  expect(view.getByText('공유 설정을 저장했어요.')).toBeTruthy();
});
