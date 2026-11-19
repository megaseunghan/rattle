import * as SecureStore from 'expo-secure-store';

/** 로그아웃/계정 교체 전 호출. 매장폰 토큰은 별도 수명이며 여기서 지우지 않는다. */
export async function clearAttendanceDeviceCredentials(userId: string): Promise<boolean> {
  if (!userId) return true;
  const key = `attendance.device.${userId}`;
  let cleared = true;
  try {
    const raw = await SecureStore.getItemAsync(key);
    const pointer: unknown = raw ? JSON.parse(raw) : null;
    const deviceId = (pointer as { device_id?: unknown } | null)?.device_id;
    if (typeof deviceId === 'string' && /^[a-zA-Z0-9-]+$/.test(deviceId)) {
      await SecureStore.deleteItemAsync(`${key}.${deviceId}`);
    } else if (raw) cleared = false;
  } catch { cleared = false; }
  try { await SecureStore.deleteItemAsync(key); }
  catch { cleared = false; }
  if (!cleared) console.warn('[Attendance] DEVICE_CREDENTIAL_CLEANUP_FAILED');
  return cleared;
}
