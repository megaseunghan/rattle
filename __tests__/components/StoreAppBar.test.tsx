import { fireEvent, render, screen } from '@testing-library/react-native';
import { StoreAppBar } from '../../lib/components/StoreAppBar';
import { Colors } from '../../constants/colors';

let mockReduced = false;
jest.mock('../../lib/hooks/useReducedTransparency', () => ({ useReducedTransparency: () => mockReduced }));
jest.mock('expo-blur', () => ({ BlurView: (props: any) => require('react').createElement(require('react-native').View, { ...props, testID: 'toolbar-blur' }) }));
beforeEach(() => { mockReduced = false; });

it('더보기와 알림을 각각 한 번 실행하고 로고·매장명을 하나로 읽는다', () => {
  const onMenu = jest.fn(), onNotifications = jest.fn();
  render(<StoreAppBar name="매장 이름" unreadCount={3} onMenu={onMenu} onNotifications={onNotifications} />);
  expect(screen.getByLabelText('Rattle, 매장 이름')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '더보기' }));
  fireEvent.press(screen.getByRole('button', { name: '알림, 읽지 않은 알림 3개' }));
  expect(onMenu).toHaveBeenCalledTimes(1);
  expect(onNotifications).toHaveBeenCalledTimes(1);
});

it('긴 매장명은 표시만 말줄임하고 전체 접근성 이름과 알림 갱신을 유지한다', () => {
  const name = '매장 이름이 긴 경우의 표시 예시';
  const props = { name, onMenu: jest.fn(), onNotifications: jest.fn() };
  const view = render(<StoreAppBar {...props} unreadCount={1} />);
  expect(screen.getByText(name).props.numberOfLines).toBe(1);
  expect(screen.getByLabelText(`Rattle, ${name}`)).toBeTruthy();
  view.rerender(<StoreAppBar {...props} unreadCount={0} />);
  expect(screen.queryByLabelText('알림, 읽지 않은 알림 1개')).toBeNull();
  expect(screen.getByRole('button', { name: '알림' })).toBeTruthy();
});

it('44pt 버튼을 유지하며 키보드 포커스만으로 메뉴를 열지 않는다', () => {
  const onMenu = jest.fn();
  render(<StoreAppBar name="매장" unreadCount={0} onMenu={onMenu} onNotifications={jest.fn()} />);
  const button = screen.getByRole('button', { name: '더보기' });
  expect(button).toHaveStyle({ width: 44, height: 44 });
  fireEvent(button, 'focus');
  expect(screen.getByRole('button', { name: '더보기' })).toHaveStyle({ borderColor: Colors.action });
  expect(onMenu).not.toHaveBeenCalled();
  fireEvent(button, 'blur');
  expect(screen.getByRole('button', { name: '더보기' })).toHaveStyle({ borderColor: 'transparent' });
});

it('투명도 줄이기에서는 기존 글래스 불투명 대체를 사용한다', () => {
  const props = { name: '매장', unreadCount: 0, onMenu: jest.fn(), onNotifications: jest.fn() };
  const view = render(<StoreAppBar {...props} />);
  expect(screen.getByTestId('toolbar-blur')).toBeTruthy();
  mockReduced = true;
  view.rerender(<StoreAppBar {...props} />);
  expect(screen.queryByTestId('toolbar-blur')).toBeNull();
  expect(screen.getByRole('button', { name: '더보기' })).toBeTruthy();
});
