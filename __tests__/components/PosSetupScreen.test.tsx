import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import PosSyncScreen from '../../app/settings/pos-sync';
import { getStoreDetails } from '../../lib/services/stores';
const mockReplace = jest.fn();
let mockStore = { id: 'a', name: 'A매장' };
jest.mock('expo-router', () => {
  const React = require('react');
  return { router: { replace: (...args: unknown[]) => mockReplace(...args), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({ setup: '1' }), useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]) };
});
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: mockStore, currentRole: 'admin' }) }));
jest.mock('../../lib/services/stores', () => ({ getStoreDetails: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); mockStore = { id: 'a', name: 'A매장' }; });
it('연결을 조회하는 동안 완료로 표시하지 않고 나중에 시작할 수 있다', () => {
  (getStoreDetails as jest.Mock).mockImplementation(() => new Promise(() => {}));
  const view = render(<PosSyncScreen />);
  expect(view.getByText('A매장')).toBeTruthy();
  expect(view.getByText('연결 상태를 확인하고 있어요')).toBeTruthy();
  expect(view.queryByText('연동완료')).toBeNull();
  fireEvent.press(view.getByRole('button', { name: '나중에 연결하고 시작하기' }));
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
});
it('이전 매장의 늦은 연결 응답은 새 매장의 상태를 덮어쓰지 않는다', async () => {
  let finishA!: (result: any) => void;
  (getStoreDetails as jest.Mock).mockImplementation((id: string) => id === 'a' ? new Promise(resolve => { finishA = resolve; }) : Promise.resolve({ toss_merchant_id: null }));
  const view = render(<PosSyncScreen />);
  mockStore = { id: 'b', name: 'B매장' };
  view.rerender(<PosSyncScreen />);
  await waitFor(() => expect(view.getByText('포스에서 서비스코드를 입력하세요')).toBeTruthy());
  await act(async () => finishA({ toss_merchant_id: 'old-merchant' }));
  expect(view.getByText('B매장')).toBeTruthy();
  expect(view.queryByText('연동완료')).toBeNull();
});
it('5초보다 느린 응답도 중복 폴링 없이 반영한다', async () => {
  jest.useFakeTimers();
  let finish!: (result: any) => void;
  (getStoreDetails as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<PosSyncScreen />);
  act(() => { jest.advanceTimersByTime(11000); });
  expect(getStoreDetails).toHaveBeenCalledTimes(1);
  await act(async () => finish({ toss_merchant_id: 'confirmed' }));
  expect(view.getByText('연동완료')).toBeTruthy();
  view.unmount();
  jest.useRealTimers();
});
