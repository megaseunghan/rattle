import { act, render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';
import { MoreDrawer } from '../../lib/components/MoreDrawer';
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
