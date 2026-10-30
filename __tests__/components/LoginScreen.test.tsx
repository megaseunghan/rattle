import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import LoginScreen from '../../app/(auth)/login';
import { signInWithSocialProvider } from '../../lib/services/socialAuth';
import { isQaLoginEnabled, signInForQa, getInitialQaRole } from '../../lib/services/qaLogin';
const mockQaParams: { qaRole?: string } = {};

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: () => mockQaParams }));
jest.mock('../../lib/services/qaLogin', () => ({ isQaLoginEnabled: jest.fn(), signInForQa: jest.fn(), getInitialQaRole: jest.fn() }));
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
  delete mockQaParams.qaRole;
  (isQaLoginEnabled as jest.Mock).mockReturnValue(false);
  (signInForQa as jest.Mock).mockResolvedValue(undefined);
  (getInitialQaRole as jest.Mock).mockResolvedValue(null);
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

it('일반 빌드는 테스트 로그인 버튼을 표시하지 않는다', () => {
  render(<LoginScreen />);
  expect(screen.queryByText('래틀 테스트 로그인')).toBeNull();
  expect(signInForQa).not.toHaveBeenCalled();
});
it('테스트 빌드는 세 역할을 표시하고 선택한 계정으로 로그인한다', async () => {
  (isQaLoginEnabled as jest.Mock).mockReturnValue(true);
  render(<LoginScreen />);
  expect(screen.getByLabelText('관리자 테스트 로그인')).toBeTruthy();
  expect(screen.getByLabelText('직원 테스트 로그인')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByLabelText('파트타이머 테스트 로그인')));
  expect(signInForQa).toHaveBeenCalledWith('part_time');
});
it('역할별 시뮬레이터 링크는 지정 계정으로 한 번만 로그인한다', async () => {
  (isQaLoginEnabled as jest.Mock).mockReturnValue(true);
  mockQaParams.qaRole = 'regular';
  render(<LoginScreen />);
  await waitFor(() => expect(signInForQa).toHaveBeenCalledTimes(1));
  expect(signInForQa).toHaveBeenCalledWith('regular');
});
