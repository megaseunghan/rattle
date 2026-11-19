import { useEffect, useRef, useState } from 'react';
import * as Enrollment from '../services/attendanceScannerEnrollment';
import type { AttendanceScannerEnrollmentService } from '../services/attendanceScannerEnrollment';
import { useAuth } from '../contexts/AuthContext';
import { useScopedWriteGuard } from './useScopedWriteGuard';
const defaultService: AttendanceScannerEnrollmentService = Enrollment;
export function useScannerPairing(service: AttendanceScannerEnrollmentService = defaultService) {
  const { store, user, canManageStore, devPreviewMode, permissionRevision } = useAuth();
  const scope = `${user?.id}:${store?.id}:${permissionRevision}:${devPreviewMode}`;
  const current = useRef(scope); current.current = scope;
  const canWrite = useScopedWriteGuard([]); const busy = useRef(false);
  const [state, setState] = useState({ scope, qr: '', expiresAt: 0, loading: false, error: '' });
  const [now, setNow] = useState(Date.now());
  useEffect(() => { busy.current = false; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [scope]);
  const allowed = canManageStore && devPreviewMode === 'self';
  async function issue() {
    if (!allowed || !canWrite() || !store || busy.current || current.current !== scope) return;
    busy.current = true; setState({ scope, qr: '', expiresAt: 0, loading: true, error: '' });
    try {
      const result = await service.issueAttendanceScannerPairingQr?.({ storeId: store.id, label: '매장폰' });
      if (!canWrite() || current.current !== scope) return;
      if (result?.status === 'success') setState({ scope, qr: result.data.qr, expiresAt: Date.parse(result.data.expiresAt), loading: false, error: '' });
      else setState({ scope, qr: '', expiresAt: 0, loading: false, error: '등록 QR을 불러오지 못했어요. 잠시 후 다시 열어주세요' });
    } catch { if (canWrite() && current.current === scope) setState({ scope, qr: '', expiresAt: 0, loading: false, error: '등록 QR을 불러오지 못했어요. 잠시 후 다시 열어주세요' }); }
    finally { if (current.current === scope) busy.current = false; }
  }
  const visible = state.scope === scope && allowed ? state : { qr: '', expiresAt: 0, loading: false, error: '' };
  return { ...visible, qr: now < visible.expiresAt ? visible.qr : '', expired: visible.expiresAt > 0 && now >= visible.expiresAt, allowed, issue };
}
