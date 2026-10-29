// Native motion is verified in Release apps; Jest tests state/lifecycle without loading a native worklet runtime.
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text, Image, Easing } = require('react-native');
  return {
    __esModule: true, default: { View, Text, Image, createAnimatedComponent: component => component },
    Easing, ReduceMotion: { System: 'system' }, cancelAnimation: jest.fn(),
    useSharedValue: value => React.useRef({ value }).current,
    useAnimatedStyle: factory => factory(), useAnimatedProps: factory => factory(),
    withTiming: (value, _options, done) => { done?.(true); return value; },
    withSpring: (value, _options, done) => { done?.(true); return value; },
  };
});
jest.mock('react-native-worklets', () => ({ scheduleOnRN: (callback, ...args) => callback(...args) }));
