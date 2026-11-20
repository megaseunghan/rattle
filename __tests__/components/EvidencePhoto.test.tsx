import { fireEvent, render } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { EvidencePhoto } from '../../lib/components/EvidencePhoto';

jest.mock('expo-image', () => ({ Image: 'Image' }));

function viewer() {
  const close = jest.fn();
  const view = render(<EvidencePhoto source={{ uri: 'file:///synthetic.jpg' }} onClose={close} />);
  const frame = view.getByTestId('evidence-photo');
  fireEvent(frame, 'layout', { nativeEvent: { layout: { width: 300, height: 600 } } });
  fireEvent(view.UNSAFE_getByType(Image), 'load', { source: { width: 300, height: 300 } });
  function send(event: string, x: number, y: number, fingers = 1, distance = 20) {
    const touches = Array.from({ length: fingers }, (_, i) => ({ pageX: x + i * distance, pageY: y }));
    fireEvent(frame, event, { nativeEvent: { pageX: x, pageY: y, locationX: x, locationY: y, touches } });
  }
  return { close, send };
}

it.each([
  [150, 300, 150, 190, true], [150, 300, 150, 420, true],
  [150, 40, 150, 41, true], [150, 300, 150, 301, false],
  [150, 300, 225, 310, false],
])('사진 영역과 쓸기 방향에 따라 닫기 (%i,%i → %i,%i)', (x, y, endX, endY, closes) => {
  const { close, send } = viewer();
  send('responderGrant', Number(x), Number(y));
  send('responderRelease', Number(endX), Number(endY), 0);
  expect(close).toHaveBeenCalledTimes(closes ? 1 : 0);
});

it('핀치 후 남은 손가락 이동과 확대 상태의 드래그는 닫지 않는다', () => {
  const { close, send } = viewer();
  send('responderGrant', 100, 200);
  send('touchStart', 100, 200, 2);
  send('responderMove', 100, 200, 2, 50);
  send('responderMove', 100, 400);
  send('responderRelease', 100, 400, 0);
  send('responderGrant', 100, 200);
  send('responderRelease', 100, 400, 0);
  expect(close).not.toHaveBeenCalled();
});
