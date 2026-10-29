import { act, render } from '@testing-library/react-native';
import { SplashAnimation } from '../../lib/components/SplashAnimation';
import { cancelAnimation } from 'react-native-reanimated';

let mockReduced = false;
let mockCallbacks: Array<(finished: boolean) => void> = [];
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Easing } = require('react-native');
  return {
    __esModule: true, default: { View, createAnimatedComponent: (component: unknown) => component }, Easing,
    ReduceMotion: { Never: 'never' }, Extrapolation: { CLAMP: 'clamp' },
    useReducedMotion: () => mockReduced,
    useSharedValue: (initial: number) => React.useRef({
      current: initial, get() { return this.current; }, set(value: number) { this.current = value; },
    }).current,
    useAnimatedProps: () => ({}), useAnimatedStyle: () => ({}), cancelAnimation: jest.fn(),
    withTiming: (value: number, _config: unknown, callback?: (finished: boolean) => void) => {
      if (callback) mockCallbacks.push(callback);
      return value;
    },
    withSequence: (...values: number[]) => values[values.length - 1],
    withSpring: (value: number) => value,
    withDelay: (_delay: number, value: number) => value,
  };
});
jest.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: () => void) => fn() }));
beforeEach(() => { mockReduced = false; mockCallbacks = []; jest.clearAllMocks(); });

it('네이티브 화면이 내려간 뒤 시퀀스를 시작하고 퇴장 완료 후 한 번만 끝낸다', () => {
  const done = jest.fn();
  const view = render(<SplashAnimation ready={false} onDone={done} />);
  expect(mockCallbacks).toHaveLength(0);
  view.rerender(<SplashAnimation ready onDone={done} />);
  expect(done).not.toHaveBeenCalled();
  act(() => mockCallbacks.shift()!(true)); // Continuous logo sequence
  expect(done).not.toHaveBeenCalled();
  const exit = mockCallbacks.shift()!;
  act(() => { exit(true); exit(true); });
  expect(done).toHaveBeenCalledTimes(1);
});

it('취소된 시퀀스는 화면을 종료하지 않는다', () => {
  const done = jest.fn();
  render(<SplashAnimation ready onDone={done} />);
  act(() => mockCallbacks.shift()!(false));
  expect(mockCallbacks).toHaveLength(0);
  expect(done).not.toHaveBeenCalled();
});

it('언마운트 이후 지연 완료 콜백을 무시하고 애니메이션을 취소한다', () => {
  const done = jest.fn();
  const view = render(<SplashAnimation ready onDone={done} />);
  act(() => mockCallbacks.shift()!(true));
  const exit = mockCallbacks.shift()!;
  view.unmount();
  act(() => exit(true));
  expect(done).not.toHaveBeenCalled();
  expect(cancelAnimation).toHaveBeenCalledTimes(2);
});

it('동작 줄이기는 변형 시퀀스를 생략하고 최신 완료 콜백을 사용한다', () => {
  mockReduced = true;
  const before = jest.fn(); const after = jest.fn();
  const view = render(<SplashAnimation ready onDone={before} />);
  view.rerender(<SplashAnimation ready onDone={after} />);
  expect(mockCallbacks).toHaveLength(1);
  act(() => mockCallbacks.shift()!(true));
  expect(before).not.toHaveBeenCalled();
  expect(after).toHaveBeenCalledTimes(1);
});

it('인증 준비가 늦으면 완성된 로고에서 기다린 뒤 준비 완료 때만 종료한다', () => {
  const done = jest.fn();
  const view = render(<SplashAnimation ready canExit={false} onDone={done} />);
  act(() => mockCallbacks.shift()!(true));
  expect(done).not.toHaveBeenCalled();
  expect(mockCallbacks).toHaveLength(0);
  view.rerender(<SplashAnimation ready canExit onDone={done} />);
  act(() => mockCallbacks.shift()!(true));
  expect(done).toHaveBeenCalledTimes(1);
});

it('퇴장 중 인증이 다시 대기하면 이전 완료 콜백을 무시한다', () => {
  const done = jest.fn();
  const view = render(<SplashAnimation ready onDone={done} />);
  act(() => mockCallbacks.shift()!(true));
  const oldExit = mockCallbacks.shift()!;
  view.rerender(<SplashAnimation ready canExit={false} onDone={done} />);
  act(() => oldExit(true));
  expect(done).not.toHaveBeenCalled();
  view.rerender(<SplashAnimation ready canExit onDone={done} />);
  act(() => mockCallbacks.shift()!(true));
  expect(done).toHaveBeenCalledTimes(1);
});
