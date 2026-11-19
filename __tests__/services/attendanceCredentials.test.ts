jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
import * as SecureStore from 'expo-secure-store';
import { clearAttendanceDeviceCredentials } from '../../lib/services/attendanceCredentials';
beforeEach(() => jest.resetAllMocks());
it('포인터와 연결된 시크릿만 지우고 매장폰 토큰은 유지한다', async () => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify({ device_id: 'device' }));
  await clearAttendanceDeviceCredentials('user');
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('attendance.device.user.device');
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('attendance.device.user');
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(2);
});
it('시크릿 삭제 실패는 로그에 코드만 남기고 포인터 삭제도 시도한다', async () => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('{"device_id":"device"}');
  (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(new Error('private'));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(clearAttendanceDeviceCredentials('user')).resolves.toBe(false);
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('attendance.device.user');
  expect(JSON.stringify(warn.mock.calls)).not.toContain('private');
  warn.mockRestore();
});
it('깨진 포인터도 로그아웃을 막지 않고 제거한다', async () => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('broken');
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(clearAttendanceDeviceCredentials('user')).resolves.toBe(false);
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('attendance.device.user');
  warn.mockRestore();
});
