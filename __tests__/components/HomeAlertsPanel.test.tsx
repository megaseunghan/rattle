import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { HomeAlertsPanel } from '../../lib/components/HomeAlertsPanel';
const mockMarkRead = jest.fn();
const alert = { key: 'stock:1', kind: 'stock', message: '우유 · 1개 남았어요', actionLabel: '재고 확인', route: '/stock/1' };
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('../../lib/hooks/useHomeAlerts', () => ({ useHomeAlerts: () => ({ alerts: [alert], error: null, refetch: jest.fn(), markRead: (...args: unknown[]) => mockMarkRead(...args) }) }));
beforeEach(() => { jest.clearAllMocks(); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
it('알림을 누르면 읽음 저장을 기다리지 않고 바로 이동한다', async () => {
  mockMarkRead.mockImplementation(() => new Promise(() => {}));
  render(<HomeAlertsPanel />);
  fireEvent.press(screen.getByText('우유 · 1개 남았어요'));
  expect(router.push).toHaveBeenCalledWith('/stock/1');
  expect(mockMarkRead).toHaveBeenCalledWith('stock:1');
});
it('이동한 뒤 읽음 저장이 실패해도 이동한 화면을 막는 안내를 띄우지 않는다', async () => {
  mockMarkRead.mockRejectedValue(new Error('offline'));
  render(<HomeAlertsPanel />);
  await act(async () => { fireEvent.press(screen.getByText('우유 · 1개 남았어요')); });
  expect(router.push).toHaveBeenCalledWith('/stock/1');
  expect(Alert.alert).not.toHaveBeenCalled();
});
it('읽음 처리 버튼은 저장 실패를 안내하고 이동하지 않는다', async () => {
  mockMarkRead.mockRejectedValue(new Error('offline'));
  render(<HomeAlertsPanel />);
  await act(async () => { fireEvent.press(screen.getByLabelText('우유 · 1개 남았어요 읽음 처리')); });
  expect(router.push).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith('읽음 처리 실패', expect.any(String));
});
