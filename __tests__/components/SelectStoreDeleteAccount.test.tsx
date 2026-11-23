import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SelectStore from '../../app/(auth)/select-store';

const mockDeleteAccount = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue(undefined);
const mockRefresh = jest.fn().mockResolvedValue(undefined);
const mockSwitch = jest.fn();
const mockStores: unknown[] = [];
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), useFocusEffect: (cb: any) => require('react').useEffect(cb, [cb]) }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u' }, store: null, stores: mockStores, storesLoaded: true, devPreviewMode: 'self', switchStore: mockSwitch, refreshStore: mockRefresh, signOut: mockSignOut }) }));
jest.mock('../../lib/services/stores', () => ({ listMyDeletedStores: async () => [], restoreDeletedStore: jest.fn() }));
jest.mock('../../lib/services/account', () => ({ deleteAccount: (...a: unknown[]) => mockDeleteAccount(...a) }));
jest.mock('../../lib/services/socialAuth', () => ({ isAuthCancelled: () => false }));
jest.mock('../../lib/components/StoreSetupWizard', () => ({ StoreSetupWizard: () => null }));

afterEach(() => { jest.restoreAllMocks(); mockDeleteAccount.mockReset(); mockSignOut.mockClear(); });

async function confirmDelete() {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  render(<SelectStore />);
  await waitFor(() => expect(screen.getByText('회원 탈퇴')).toBeTruthy());
  fireEvent.press(screen.getByText('회원 탈퇴'));
  const buttons = alert.mock.calls.at(-1)![2]!;
  await act(async () => { await buttons.find(b => b.text === '탈퇴하기')!.onPress!(); });
  return alert;
}

it('매장이 없는 계정도 매장 선택 화면에서 탈퇴하고 로그아웃한다', async () => {
  mockDeleteAccount.mockResolvedValue(undefined);
  await confirmDelete();
  expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
  expect(mockSignOut).toHaveBeenCalledTimes(1);
});

it('탈퇴에 실패하면 로그아웃하지 않고 안내를 보여준다', async () => {
  mockDeleteAccount.mockRejectedValue(new Error('x'));
  const alert = await confirmDelete();
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(alert).toHaveBeenLastCalledWith('탈퇴 확인', expect.any(String));
});
