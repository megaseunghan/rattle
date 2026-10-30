import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';

const mockDispatch = jest.fn();
const mockUnsubscribe = jest.fn();
let mockBeforeRemove: (event: any) => void;
const mockNavigation = {
  addListener: jest.fn((_: string, callback: (event: any) => void) => { mockBeforeRemove = callback; return mockUnsubscribe; }),
  dispatch: mockDispatch,
};
jest.mock('expo-router', () => ({ useNavigation: () => mockNavigation }));
beforeEach(() => { jest.clearAllMocks(); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());
function leave() { const event = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } }; act(() => mockBeforeRemove(event)); return event; }

it('작성 중 뒤로가기에서 계속 작성은 원래 이동을 실행하지 않는다', () => {
  renderHook(() => useConfirmLeave(true));
  const event = leave();
  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
  expect(buttons[0].text).toBe('계속 작성');
  expect(buttons[0].style).toBe('cancel');
  expect(mockDispatch).not.toHaveBeenCalled();
});
it('명시적으로 나가기를 선택했을 때에만 원래 뒤로 이동을 전달한다', () => {
  renderHook(() => useConfirmLeave(true)); const event = leave();
  act(() => (Alert.alert as jest.Mock).mock.calls[0][2][1].onPress());
  expect(mockDispatch).toHaveBeenCalledWith(event.data.action);
  expect(mockDispatch).toHaveBeenCalledTimes(1);
});
it('저장 중에는 버리기 선택지를 주지 않고 이동을 막는다', () => {
  renderHook(() => useConfirmLeave(true, { blockLeave: true }));
  expect(leave().preventDefault).toHaveBeenCalledTimes(1);
  expect(Alert.alert).toHaveBeenCalledWith('저장 중이에요', '처리가 끝난 뒤 이동해 주세요.');
  expect(mockDispatch).not.toHaveBeenCalled();
});
it('저장 완료 후 의도한 복귀는 다시 이탈 확인을 띄우지 않는다', () => {
  const { result } = renderHook(() => useConfirmLeave(true)); act(() => result.current());
  expect(leave().preventDefault).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});
it('빈 폼은 이동을 허용하고 언마운트 시 구독을 정리한다', () => {
  const { unmount } = renderHook(() => useConfirmLeave(false));
  expect(leave().preventDefault).not.toHaveBeenCalled();
  unmount(); expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});
