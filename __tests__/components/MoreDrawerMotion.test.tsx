import 'react-native-gesture-handler/jestSetup';
import { act, render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';
import { MoreDrawer } from '../../lib/components/MoreDrawer';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
// Gesture Handler registers native events; the test utility drives callbacks below.
Object.assign(Reanimated, { useEvent: () => undefined });
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ stores: [], store: null, currentRole: 'member', user: null }) }));
jest.mock('../../lib/services/account', () => ({ deleteAccount: jest.fn() }));
jest.mock('../../lib/services/socialAuth', () => ({ isAuthCancelled: jest.fn() }));
it('닫힘 뒤 늦게 도착한 콜백은 다시 열린 서랍을 숨기지 않는다', () => {
  const completions: ((finished: boolean) => void)[] = [];
  const timing = jest.spyOn(Reanimated, 'withTiming').mockImplementation(((value: number, _config: unknown, done?: (finished: boolean) => void) => {
    if (done) completions.push(done);
    return value;
  }) as any);
  try {
    const view = render(<MoreDrawer visible onClose={jest.fn()} />);
    view.rerender(<MoreDrawer visible={false} onClose={jest.fn()} />);
    const stale = completions[completions.length - 1];
    view.rerender(<MoreDrawer visible onClose={jest.fn()} />);
    act(() => stale(true));
    expect(view.getByText('더보기')).toBeTruthy();
    view.rerender(<MoreDrawer visible={false} onClose={jest.fn()} />);
    act(() => completions[completions.length - 1](true));
    expect(view.queryByText('더보기')).toBeNull();
    view.unmount();
    expect(Reanimated.cancelAnimation).toHaveBeenCalled();
  } finally { timing.mockRestore(); }
});

it('짧은 가장자리 드래그를 취소한 뒤 다시 밀어 열 수 있다', () => {
  const onOpen = jest.fn();
  const view = render(<MoreDrawer visible={false} onOpen={onOpen} onClose={jest.fn()} />);
  act(() => fireGestureHandler(getByGestureTestId('drawer-open'), [
    { state: State.BEGAN, translationX: 0, velocityX: 0 },
    { state: State.ACTIVE, translationX: 24, velocityX: 0 },
    { state: State.END, translationX: 24, velocityX: 0 },
  ]));
  expect(onOpen).not.toHaveBeenCalled();
  expect(view.queryByText('더보기')).toBeNull();
  act(() => fireGestureHandler(getByGestureTestId('drawer-open'), [
    { state: State.BEGAN, translationX: 0, velocityX: 0 },
    { state: State.ACTIVE, translationX: 180, velocityX: 0 },
    { state: State.END, translationX: 180, velocityX: 0 },
  ]));
  expect(onOpen).toHaveBeenCalledTimes(1);
  view.rerender(<MoreDrawer visible onOpen={onOpen} onClose={jest.fn()} />);
  expect(view.getByText('더보기')).toBeTruthy();
});

it('시스템이 드래그를 취소하면 서랍을 열린 상태로 남기지 않는다', () => {
  const onOpen = jest.fn();
  const view = render(<MoreDrawer visible={false} onOpen={onOpen} onClose={jest.fn()} />);
  act(() => fireGestureHandler(getByGestureTestId('drawer-open'), [
    { state: State.BEGAN, translationX: 0, velocityX: 0 },
    { state: State.ACTIVE, translationX: 120, velocityX: 0 },
    { state: State.CANCELLED, translationX: 120, velocityX: 0 },
  ]));
  expect(onOpen).not.toHaveBeenCalled();
  expect(view.queryByText('더보기')).toBeNull();
});
