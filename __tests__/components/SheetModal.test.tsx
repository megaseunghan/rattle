import { act, fireEvent, render } from '@testing-library/react-native';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { withTiming } from 'react-native-reanimated';
import { SheetModal } from '../../lib/components/ui/SheetModal';
jest.mock('react-native-reanimated', () => {
  const React = require('react'); const { View, Easing } = require('react-native');
  return { __esModule: true, default: { View }, Easing, ReduceMotion: { System: 'system' }, cancelAnimation: jest.fn(),
    useSharedValue: (value: number) => React.useRef({ value }).current, useAnimatedStyle: (factory: any) => factory(),
    withTiming: jest.fn((value: number) => value) };
});
const close = jest.fn(); const dismissed = jest.fn();
const content = (visible: boolean, label = '내용') => <SheetModal visible={visible} onRequestClose={close} onDismiss={dismissed}><View testID="overlay" style={{ flex: 1, backgroundColor: 'black', justifyContent: 'flex-end' }}><View testID="surface"><Text>{label}</Text></View></View></SheetModal>;
beforeEach(() => jest.clearAllMocks());
it('배경은 이동 레이어 밖에 두고 기존 오버레이를 투명하게 한다', () => {
  const ui = render(content(true));
  expect(ui.UNSAFE_getByType(Modal).props.animationType).toBe('none');
  expect(StyleSheet.flatten(ui.getByTestId('sheet-fixed-backdrop', { includeHiddenElements: true }).props.style).transform).toBeUndefined();
  expect(StyleSheet.flatten(ui.getByTestId('overlay').props.style).backgroundColor).toBe('transparent');
  fireEvent(ui.getByTestId('surface'), 'layout', { nativeEvent: { layout: { height: 300 } } });
  fireEvent(ui.UNSAFE_getByType(Modal), 'show');
  expect(withTiming).toHaveBeenCalledWith(0, expect.objectContaining({ reduceMotion: 'system' }));
});
it('이전 닫힘 콜백이 재열기 후 새 닫힘을 중단하지 않는다', () => {
  const callbacks: ((finished: boolean) => void)[] = [];
  (withTiming as jest.Mock).mockImplementation((value, _options, callback) => { if (callback) callbacks.push(callback); return value; });
  const ui = render(content(true));
  fireEvent(ui.getByTestId('surface'), 'layout', { nativeEvent: { layout: { height: 300 } } });
  fireEvent(ui.UNSAFE_getByType(Modal), 'show');
  ui.rerender(content(false, '닫힌 내용'));
  expect(ui.getByText('내용')).toBeTruthy();
  const old = callbacks[callbacks.length - 1];
  ui.rerender(content(true)); ui.rerender(content(false));
  const latest = callbacks[callbacks.length - 1];
  act(() => old(true)); expect(ui.UNSAFE_getByType(Modal).props.visible).toBe(true);
  act(() => latest(true)); expect(ui.UNSAFE_getByType(Modal).props.visible).toBe(false);
  fireEvent(ui.UNSAFE_getByType(Modal), 'dismiss'); expect(dismissed).toHaveBeenCalledTimes(1);
});
