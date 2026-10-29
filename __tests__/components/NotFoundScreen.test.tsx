import { fireEvent, render, screen } from '@testing-library/react-native';
import NotFoundScreen from '../../app/+not-found';

const mockReplace = jest.fn();
let mockAuth = { user: null as object | null, store: null as object | null, loading: false };
jest.mock('expo-router', () => ({ router: { replace: (...args: unknown[]) => mockReplace(...args) } }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));

beforeEach(() => { mockReplace.mockClear(); mockAuth = { user: null, store: null, loading: false }; });
it.each([
  [null, null, '/(auth)/login'],
  [{ id: 'user' }, null, '/(auth)/select-store'],
  [{ id: 'user' }, { id: 'store' }, '/(tabs)'],
])('인증과 매장 상태에 맞는 복구 경로를 제공한다', (user, store, route) => {
  mockAuth = { user, store, loading: false };
  render(<NotFoundScreen />);
  fireEvent.press(screen.getByText('홈으로 돌아가기'));
  expect(mockReplace).toHaveBeenCalledWith(route);
});
it('세션을 확인하기 전에는 복구 경로를 결정하지 않는다', () => {
  mockAuth.loading = true;
  render(<NotFoundScreen />);
  fireEvent.press(screen.getByText('홈으로 돌아가기'));
  expect(mockReplace).not.toHaveBeenCalled();
});
