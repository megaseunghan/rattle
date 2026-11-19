import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../contexts/AuthContext';
import { issueAttendanceQr, registerAttendanceDevice } from '../services/attendance';
import { createAttendanceQr } from '../utils/attendanceQr';
import { defaultAttendanceHmacSha256 } from '../utils/attendanceHmac';
import { useScopedWriteGuard } from './useScopedWriteGuard';

type Credential = { device_id: string; secret: string; status: 'active' | 'pending' };
type QrState = 'loading' | 'ready' | 'unregistered' | 'pending' | 'error' | 'denied' | 'unknown' | 'rate_limited';
// One short-lived, memory-only QR across S43 remounts; never a credential/query cache.
let recent: { scope: string; qr: string; expiresAt: number; retryAt: number } | null = null;
let issuance: { scope: string; promise: ReturnType<typeof issueAttendanceQr> } | null = null;
const RATE_LIMIT_WAIT_MS = 45_000; // Current server nonce lifetime; no retry-after field.
/** No credentials in query caches, route params, logs, or AsyncStorage. */
export function useAttendanceQr(employeeId?: string, focused = true) {
  const auth = useAuth();
  const canWrite = useScopedWriteGuard([employeeId]);
  const scope = `${auth.user?.id}:${auth.store?.id}:${employeeId}:${auth.permissionRevision}:${auth.devPreviewMode}`;
  const [now, setNow] = useState(Date.now);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const visible = focused && foreground;
  const visibility = useRef(visible); visibility.current = visible;
  const identity = useRef(scope); identity.current = scope;
  const sequence = useRef(0); const busy = useRef(false); const credential = useRef<Credential | null>(null);
  const [value, setValue] = useState({ scope, state: 'loading' as QrState, qr: '', expiresAt: 0, retryAt: 0 });
  const key = auth.user ? `attendance.device.${auth.user.id}` : '';
  const allowed = !!employeeId && !!auth.user && !!auth.store && auth.devPreviewMode === 'self';
  const refresh = useCallback(async (register = false) => {
    if (!visibility.current || !allowed || !canWrite() || identity.current !== scope || busy.current) return;
    setNow(Date.now());
    if (recent?.scope === scope) {
      if (recent.retryAt > Date.now()) { setValue({ ...recent, state: 'rate_limited' }); return; }
      if (recent.qr && recent.expiresAt > Date.now() + 15_000) { setValue({ ...recent, state: 'ready' }); return; }
    }
    busy.current = true; const version = ++sequence.current;
    const sameIdentity = () => canWrite() && identity.current === scope && sequence.current === version;
    const current = () => visibility.current && sameIdentity();
    setValue({ scope, state: 'loading', qr: '', expiresAt: 0, retryAt: 0 });
    try {
      if (!credential.current) {
        const stored = await SecureStore.getItemAsync(key);
        if (!current()) return;
        const parsed = stored ? JSON.parse(stored) : null;
        if (parsed?.registration_unknown) { setValue({ scope, state: 'unknown', qr: '', expiresAt: 0, retryAt: 0 }); return; }
        credential.current = parsed as Credential | null;
      }
      if (!credential.current && register) {
        const result = await registerAttendanceDevice({ p_label: '내 휴대폰' });
        // Blur stops QR issuance, but must not lose an already submitted registration.
        if (!sameIdentity()) return;
        if (result.status !== 'success') {
          if (result.status === 'unknown') await SecureStore.setItemAsync(key, JSON.stringify({ registration_unknown: true }), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
          if (current()) setValue({ scope, state: result.status === 'unknown' ? 'unknown' : 'error', qr: '', expiresAt: 0, retryAt: 0 }); return;
        }
        const device = result.data;
        await SecureStore.setItemAsync(`${key}.${device.device_id}`, device.secret, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
        if (!sameIdentity()) { await SecureStore.deleteItemAsync(`${key}.${device.device_id}`); return; }
        await SecureStore.setItemAsync(key, JSON.stringify({ device_id: device.device_id, status: device.status }), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
        if (!sameIdentity()) {
          // Sign-out can race the two keychain writes; remove only this registration.
          const pointer = await SecureStore.getItemAsync(key);
          if (pointer && JSON.parse(pointer).device_id === device.device_id) await SecureStore.deleteItemAsync(key);
          await SecureStore.deleteItemAsync(`${key}.${device.device_id}`);
          return;
        }
        credential.current = device;
      }
      const device = credential.current;
      if (!device) { setValue({ scope, state: 'unregistered', qr: '', expiresAt: 0, retryAt: 0 }); return; }
      const secret = device.secret || await SecureStore.getItemAsync(`${key}.${device.device_id}`);
      if (!current()) return;
      if (!secret) { setValue({ scope, state: 'unregistered', qr: '', expiresAt: 0, retryAt: 0 }); return; }
      // Share only an in-flight issuance for this exact identity, including blur/refocus.
      if (!issuance || issuance.scope !== scope) issuance = { scope, promise: issueAttendanceQr({ p_device_id: device.device_id }) };
      const flight = issuance;
      const result = await Promise.resolve(flight.promise).finally(() => { if (issuance === flight) issuance = null; });
      if (identity.current !== scope || !canWrite()) return;
      if (result.status !== 'success' && result.error.code === 'ATTENDANCE_QR_RATE_LIMIT') {
        recent = { scope, qr: '', expiresAt: 0, retryAt: Date.now() + RATE_LIMIT_WAIT_MS };
        if (current()) setValue({ ...recent, state: 'rate_limited' });
        return;
      }
      if (result.status === 'success') {
        const qr = createAttendanceQr({ deviceId: device.device_id, secret, nonce: result.data.nonce }, defaultAttendanceHmacSha256);
        recent = { scope, qr, expiresAt: Date.parse(result.data.expires_at), retryAt: 0 };
        if (current()) setValue({ ...recent, state: 'ready' });
        return;
      }
      if (!current()) return;
      setValue({ scope, state: device.status === 'pending' ? 'pending' : 'error', qr: '', expiresAt: 0, retryAt: 0 });
    } catch { if (current()) setValue({ scope, state: 'error', qr: '', expiresAt: 0, retryAt: 0 }); }
    finally { if (sequence.current === version) busy.current = false; }
  }, [allowed, scope, key, canWrite]);
  useEffect(() => {
    credential.current = null; busy.current = false;
    if (!allowed || recent?.scope !== scope) recent = null;
    if (!allowed) setValue({ scope, state: 'denied', qr: '', expiresAt: 0, retryAt: 0 });
    return () => { sequence.current++; credential.current = null; busy.current = false; };
  }, [scope, allowed]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', next => {
      visibility.current = focused && next === 'active';
      setForeground(next === 'active');
    });
    return () => listener.remove();
  }, [focused]);
  useEffect(() => {
    if (!visible || !allowed) return;
    void refresh();
  }, [visible, allowed, refresh]);
  useEffect(() => {
    if (!visible || !allowed) return;
    // Exactly one timer for the focused foreground screen, removed on blur/background.
    const timer = setInterval(() => {
      if (!visibility.current) return;
      setNow(Date.now());
      if (value.state === 'rate_limited' && Date.now() >= value.retryAt
        || value.state === 'ready' && Date.now() >= value.expiresAt - 15000) void refresh();
    }, 1000);
    return () => clearInterval(timer);
  }, [visible, allowed, refresh, value.state, value.expiresAt, value.retryAt]);
  return { ...(value.scope === scope && allowed && visible ? value : { state: 'denied' as QrState, qr: '', expiresAt: 0, retryAt: 0 }), retrySeconds: Math.max(0, Math.ceil((value.retryAt - now) / 1000)), refresh: () => refresh(), register: () => refresh(true) };
}
