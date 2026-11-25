import { act, fireEvent, render } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { EvidencePhoto } from '../../lib/components/EvidencePhoto';

jest.mock('expo-image', () => ({ Image: 'Image' }));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function viewer() {
  const close = jest.fn();
  const view = render(<EvidencePhoto source={{ uri: 'file:///synthetic.jpg' }} onClose={close} />);
  const frame = view.getByTestId('evidence-photo');
  // 사진 영역(layout)은 frame 안쪽 View에서 잰다. inset이 0이라 화면 전체와 같다.
  view.root.findAll(node => typeof node.props.onLayout === 'function')
    .forEach(node => fireEvent(node, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 600 } } }));
  fireEvent(view.UNSAFE_getByType(Image), 'load', { source: { width: 300, height: 300 } });
  function send(event: string, x: number, y: number, fingers = 1, distance = 20, timestamp?: number) {
    const touches = Array.from({ length: fingers }, (_, i) => ({ pageX: x + i * distance, pageY: y }));
    fireEvent(frame, event, { nativeEvent: { pageX: x, pageY: y, locationX: x, locationY: y, touches, timestamp } });
  }
  const settle = () => act(() => { jest.runAllTimers(); });
  return { close, send, settle };
}

it.each([
  [150, 300, 150, 190, true], [150, 300, 150, 420, true],
  [150, 300, 150, 350, true], [150, 40, 150, 41, true],
  [150, 300, 150, 301, false], [150, 300, 225, 310, false],
  [150, 300, 150, 330, false],
])('사진 영역과 쓸기 방향·거리에 따라 닫기 (%i,%i → %i,%i)', (x, y, endX, endY, closes) => {
  const { close, send, settle } = viewer();
  send('responderGrant', Number(x), Number(y));
  send('responderRelease', Number(endX), Number(endY), 0);
  settle();
  expect(close).toHaveBeenCalledTimes(closes ? 1 : 0);
});

it('짧게라도 빠르게 아래로 튕기면 닫고, 천천히 조금 밀다 놓으면 제자리로 돌아온다', () => {
  const fast = viewer();
  fast.send('responderGrant', 150, 300, 1, 20, 1000);
  fast.send('responderMove', 150, 330, 1, 20, 1030);
  fast.send('responderRelease', 150, 330, 0, 20, 1030);
  fast.settle();
  expect(fast.close).toHaveBeenCalledTimes(1);

  const slow = viewer();
  slow.send('responderGrant', 150, 300, 1, 20, 1000);
  slow.send('responderMove', 150, 330, 1, 20, 1600);
  slow.send('responderRelease', 150, 330, 0, 20, 1600);
  slow.settle();
  expect(slow.close).not.toHaveBeenCalled();
});

it('핀치 후 남은 손가락 이동과 확대 상태의 드래그는 닫지 않는다', () => {
  const { close, send, settle } = viewer();
  send('responderGrant', 100, 200);
  send('touchStart', 100, 200, 2);
  send('responderMove', 100, 200, 2, 50);
  send('responderMove', 100, 400);
  send('responderRelease', 100, 400, 0);
  send('responderGrant', 100, 200);
  send('responderRelease', 100, 400, 0);
  settle();
  expect(close).not.toHaveBeenCalled();
});

it('VoiceOver 문지르기로 닫는다', () => {
  const { close } = viewer();
  const view = render(<EvidencePhoto source={{ uri: 'file:///synthetic.jpg' }} onClose={close} />);
  fireEvent(view.getByTestId('evidence-photo'), 'accessibilityEscape');
  expect(close).toHaveBeenCalledTimes(1);
});
