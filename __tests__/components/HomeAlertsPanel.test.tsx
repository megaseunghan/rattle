import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, PanResponder } from 'react-native';
import { router } from 'expo-router';
import { HomeAlertsPanel } from '../../lib/components/HomeAlertsPanel';
import { HomeAlert } from '../../types';
import { TabPagerContext } from '../../lib/contexts/TabPagerContext';
const alert: HomeAlert = { key: 'stock:one', kind: 'stock', message: '양파 · 현재 품절 상태를 확인해 주세요', actionLabel: '재고 확인', route: '/stock/one' };
const mockMark = jest.fn();
const mockRestore = jest.fn();
const mockRefetch = jest.fn();
let mockData: any;
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../lib/hooks/useHomeAlerts', () => ({ useHomeAlerts: () => mockData }));
jest.mock('../../lib/components/GlassCard', () => ({ GlassCard: ({ children }: any) => children }));
beforeEach(() => {
  jest.clearAllMocks();
  mockMark.mockResolvedValue(true); mockRestore.mockResolvedValue(true);
  mockData = { scope: 'a:store:true', alerts: [alert], loading: false, error: null, refetch: mockRefetch, markRead: mockMark, restoreRead: mockRestore };
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
function hide() {
  fireEvent(screen.getByLabelText(`재고, ${alert.message}`), 'accessibilityAction', { nativeEvent: { actionName: 'hide' } });
}
async function confirm() {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)[2];
  await act(async () => { await buttons.find((b: any) => b.text === '숨기기').onPress(); });
}
it('주요 행동은 화면만 열고 숨김 저장을 하지 않는다', () => {
  render(<HomeAlertsPanel />);
  fireEvent.press(screen.getByRole('button', { name: `재고 확인, ${alert.message}` }));
  expect(router.push).toHaveBeenCalledWith('/stock/one');
  expect(mockMark).not.toHaveBeenCalled();
  expect(screen.getByText('재고')).toBeTruthy();
});
it('숨김은 확인 후 저장하고 마지막 알림 완료 안내와 실행취소를 제공한다', async () => {
  const view = render(<HomeAlertsPanel />);
  hide(); expect(mockMark).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith('이 알림을 숨길까요?', expect.stringContaining('업무가 해결된 것은 아니에요'), expect.any(Array), { cancelable: true });
  await confirm();
  expect(mockMark).toHaveBeenCalledWith(alert.key);
  mockData = { ...mockData, alerts: [] }; view.rerender(<HomeAlertsPanel />);
  expect(screen.getByText('모든 알림을 확인했어요')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByText('실행취소')));
  expect(mockRestore).toHaveBeenCalledWith(alert.key);
  expect(screen.queryByText('모든 알림을 확인했어요')).toBeNull();
});
it('숨김 실패 시 알림을 유지하고 인라인 재시도를 제공한다', async () => {
  mockMark.mockRejectedValueOnce(new Error('denied'));
  render(<HomeAlertsPanel />); hide(); await confirm();
  expect(screen.getByText(alert.message)).toBeTruthy();
  expect(screen.getByText('숨김 상태를 저장하지 못했어요')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByText('다시 시도')));
  expect(mockMark).toHaveBeenCalledTimes(2);
});
it('이전 매장 확인창의 저장과 완료 상태를 새 매장에 반영하지 않는다', async () => {
  const view = render(<HomeAlertsPanel />); hide();
  mockData = { ...mockData, scope: 'a:other:true' }; view.rerender(<HomeAlertsPanel />);
  await confirm(); expect(mockMark).not.toHaveBeenCalled();
});
it('저장 중 연타를 막고 탭을 벗어나면 완료/실행취소를 해제한다', async () => {
  let finish!: (valid: boolean) => void;
  mockMark.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<HomeAlertsPanel />); hide(); await confirm();
  fireEvent.press(screen.getByRole('button', { name: `재고 확인, ${alert.message}` }));
  expect(router.push).not.toHaveBeenCalled();
  view.rerender(<HomeAlertsPanel active={false} />);
  await act(async () => finish(true));
  expect(screen.queryByText('실행취소')).toBeNull();
});
it('처음부터 알림이 없으면 완료로 오인시키지 않고 조회 오류는 재시도한다', () => {
  mockData = { ...mockData, alerts: [] };
  const view = render(<HomeAlertsPanel />);
  expect(screen.queryByText('모든 알림을 확인했어요')).toBeNull();
  mockData = { ...mockData, error: 'read failed' }; view.rerender(<HomeAlertsPanel />);
  fireEvent.press(screen.getByText('다시 시도'));
  // 2026-11-24 재진입 캐시: 마운트 조회는 useHomeAlerts(active)가 맡고 패널은 다시 시도에서만 refetch한다.
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});
it('세로·오른쪽·짧은 스와이프를 숨김으로 처리하지 않고 왼쪽 96 이상에서 확인한다', () => {
  const create = PanResponder.create;
  let config!: Parameters<typeof create>[0];
  jest.spyOn(PanResponder, 'create').mockImplementation(value => { config = value; return create(value); });
  render(<HomeAlertsPanel />);
  const event = {} as any;
  const gesture = (dx: number, dy = 0) => ({ dx, dy } as any);
  expect(config.onMoveShouldSetPanResponder!(event, gesture(120))).toBe(false);
  expect(config.onMoveShouldSetPanResponder!(event, gesture(-20, 50))).toBe(false);
  expect(config.onMoveShouldSetPanResponder!(event, gesture(-50))).toBe(true);
  act(() => config.onPanResponderRelease!(event, gesture(-60)));
  expect(Alert.alert).not.toHaveBeenCalled();
  act(() => config.onPanResponderRelease!(event, gesture(-100)));
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  expect(mockMark).not.toHaveBeenCalled();
});
it('알림 터치 중 탭 스와이프를 잠그고 취소/종료/언마운트에서 해제한다', () => {
  const setAlertGestureActive = jest.fn();
  const view = render(<TabPagerContext.Provider value={{ setAlertGestureActive } as any}><HomeAlertsPanel /></TabPagerContext.Provider>);
  const row = screen.getByTestId(`home-alert-${alert.key}`);
  act(() => row.props.onTouchStart({ nativeEvent: { changedTouches: [{ identifier: 1 }], touches: [{ identifier: 1 }] } })); expect(setAlertGestureActive).toHaveBeenLastCalledWith(expect.any(String), true);
  const owner = setAlertGestureActive.mock.calls.at(-1)[0];
  act(() => row.props.onTouchCancel({ nativeEvent: { changedTouches: [{ identifier: 1 }], touches: [] } })); expect(setAlertGestureActive).toHaveBeenLastCalledWith(owner, false, true);
  act(() => { row.props.onTouchStart({ nativeEvent: { changedTouches: [{ identifier: 1 }], touches: [{ identifier: 1 }] } }); row.props.onTouchEnd({ nativeEvent: { changedTouches: [{ identifier: 1 }], touches: [] } }); }); expect(setAlertGestureActive).toHaveBeenLastCalledWith(owner, false, true);
  act(() => row.props.onTouchStart({ nativeEvent: { changedTouches: [{ identifier: 1 }], touches: [{ identifier: 1 }] } })); view.unmount(); expect(setAlertGestureActive).toHaveBeenLastCalledWith(owner, false);
});
it('다른 행에 남은 touches와 관계없이 종료된 행의 토큰을 해제한다', () => {
  const setAlertGestureActive = jest.fn();
  const second = { ...alert, key: 'stock:two' };
  mockData = { ...mockData, alerts: [alert, second] };
  render(<TabPagerContext.Provider value={{ setAlertGestureActive } as any}><HomeAlertsPanel /></TabPagerContext.Provider>);
  const a = screen.getByTestId(`home-alert-${alert.key}`), b = screen.getByTestId(`home-alert-${second.key}`);
  const touch = (changed: number[], remaining: number[]) => ({ nativeEvent: { changedTouches: changed.map(identifier => ({ identifier })), touches: remaining.map(identifier => ({ identifier })) } });
  act(() => a.props.onTouchStart(touch([1], [1])));
  const ownerA = setAlertGestureActive.mock.calls.at(-1)[0];
  act(() => b.props.onTouchStart(touch([2], [1, 2])));
  const ownerB = setAlertGestureActive.mock.calls.at(-1)[0];
  expect(ownerA).not.toBe(ownerB);
  act(() => a.props.onTouchEnd(touch([1], [2])));
  expect(setAlertGestureActive).toHaveBeenLastCalledWith(ownerA, false, false);
  act(() => b.props.onTouchEnd(touch([2], [])));
  expect(setAlertGestureActive).toHaveBeenLastCalledWith(ownerB, false, true);
});
it('같은 native batch의 두 행 동시 시작도 마지막 종료에서 전체 잠금 해제를 요청한다', () => {
  const setAlertGestureActive = jest.fn();
  const second = { ...alert, key: 'stock:two' };
  mockData = { ...mockData, alerts: [alert, second] };
  render(<TabPagerContext.Provider value={{ setAlertGestureActive } as any}><HomeAlertsPanel /></TabPagerContext.Provider>);
  const a = screen.getByTestId(`home-alert-${alert.key}`), b = screen.getByTestId(`home-alert-${second.key}`);
  const touch = (changed: string[], remaining: string[]) => ({ nativeEvent: { changedTouches: changed.map(identifier => ({ identifier })), touches: remaining.map(identifier => ({ identifier })) } });
  act(() => { a.props.onTouchStart(touch(['1', '2'], ['1', '2'])); b.props.onTouchStart(touch(['1', '2'], ['1', '2'])); });
  act(() => a.props.onTouchEnd(touch(['1'], ['2'])));
  act(() => b.props.onTouchEnd(touch(['2'], [])));
  expect(setAlertGestureActive).toHaveBeenLastCalledWith(expect.any(String), false, true);
});
it('responder grant가 dx를 초기화해도 실제 시작점에서 충분히 민 거리를 보존한다', () => {
  const create = PanResponder.create;
  let config!: Parameters<typeof create>[0];
  jest.spyOn(PanResponder, 'create').mockImplementation(value => { config = value; return create(value); });
  render(<HomeAlertsPanel />);
  const row = screen.getByTestId(`home-alert-${alert.key}`);
  act(() => row.props.onTouchStart({ nativeEvent: { pageX: 300, pageY: 200, changedTouches: [{ identifier: '1' }], touches: [{ identifier: '1' }] } }));
  act(() => config.onPanResponderRelease!({ nativeEvent: { pageX: 150, pageY: 202 } } as any, { dx: -20, dy: 0 } as any));
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  expect(mockMark).not.toHaveBeenCalled();
});
it('화면 밖 다른 손가락이 이미 닿아 있으면 이전 시작점으로 숨김을 오탐하지 않는다', () => {
  const create = PanResponder.create; let config!: Parameters<typeof create>[0];
  jest.spyOn(PanResponder, 'create').mockImplementation(value => { config = value; return create(value); });
  render(<HomeAlertsPanel />); const row = screen.getByTestId(`home-alert-${alert.key}`);
  const start = (x: number, ids: string[]) => ({ nativeEvent: { pageX: x, pageY: 200, changedTouches: [{ identifier: 'row' }], touches: ids.map(identifier => ({ identifier })) } });
  act(() => row.props.onTouchStart(start(300, ['row'])));
  act(() => row.props.onTouchStart(start(150, ['outside', 'row'])));
  act(() => config.onPanResponderRelease!({ nativeEvent: { pageX: 140, pageY: 200 } } as any, { dx: -10, dy: 0 } as any));
  expect(Alert.alert).not.toHaveBeenCalled();
});
it('처음 불러올 때만 스켈레톤을 보이고, 알림 없는 매장의 재조회는 빈 카드를 띄우지 않는다', () => {
  mockData = { ...mockData, alerts: [], loading: true, initialLoading: true };
  const view = render(<HomeAlertsPanel />);
  expect(screen.getByLabelText('홈 알림 불러오는 중')).toBeTruthy();
  mockData = { ...mockData, alerts: [], loading: true, initialLoading: false };
  view.rerender(<HomeAlertsPanel />);
  expect(screen.queryByLabelText('홈 알림 불러오는 중')).toBeNull();
  expect(view.toJSON()).toBeNull();
});
