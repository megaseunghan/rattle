import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import LoginScreen from '../../app/(auth)/login';
import { signInWithSocialProvider } from '../../lib/services/socialAuth';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../lib/services/socialAuth', () => ({ signInWithSocialProvider: jest.fn() }));
jest.mock('expo-apple-authentication', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    AppleAuthenticationButtonType: { CONTINUE: 1 }, AppleAuthenticationButtonStyle: { BLACK: 2 },
    AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) => React.createElement(Pressable, { onPress }, React.createElement(Text, {}, 'Apple로 계속하기')),
  };
});
const originalPlatform = Platform.OS;
afterEach(() => Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true }));
beforeEach(() => {
  jest.resetAllMocks();
  (signInWithSocialProvider as jest.Mock).mockResolvedValue(false);
});
it('로그인 화면에 세 로그인 수단을 표시하고 Google 인증 취소는 오류 없이 끝난다', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  render(<LoginScreen />);
  await waitFor(() => expect(screen.getByText('Apple로 계속하기')).toBeTruthy());
  expect(screen.getByText('카카오로 시작하기')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Google로 계속하기'));
  await waitFor(() => expect(signInWithSocialProvider).toHaveBeenCalledWith('google'));
  expect(alert).not.toHaveBeenCalled();
  alert.mockRestore();
});
it('Android에서도 Apple 로그인을 포함한 세 버튼을 표시한다', () => {
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  render(<LoginScreen />);
  expect(screen.getByLabelText('Apple로 계속하기')).toBeTruthy();
});
it('iOS 로그인 진행 중 다른 로그인 수단을 동시에 시작하지 않는다', async () => {
  let finish!: (value: boolean) => void;
  (signInWithSocialProvider as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<LoginScreen />);
  await waitFor(() => expect(screen.getByText('Apple로 계속하기')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Google로 계속하기'));
  fireEvent.press(screen.getByText('카카오로 시작하기'));
  fireEvent.press(screen.getByText('Apple로 계속하기'));
  expect(signInWithSocialProvider).toHaveBeenCalledTimes(1);
  await act(async () => { finish(false); });
  fireEvent.press(screen.getByText('카카오로 시작하기'));
  expect(signInWithSocialProvider).toHaveBeenLastCalledWith('kakao');
  await act(async () => { finish(false); });
});
