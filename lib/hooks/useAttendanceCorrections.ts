import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { cancelAttendanceCorrection, getAttendanceCorrections, requestAttendanceCorrection } from '../services/attendance';
import type { AttendanceCorrectionWithHistory, AttendanceRpcArgs } from '../../types';
import { useScopedWriteGuard } from './useScopedWriteGuard';

export function useAttendanceCorrections(employeeId?: string) {
  const canWrite = useScopedWriteGuard([employeeId]);
  const { user, store, devPreviewMode, permissionRevision } = useAuth();
  const scope = `${user?.id}:${store?.id}:${employeeId}:${devPreviewMode}:${permissionRevision}`;
  const identity = useRef(scope); identity.current = scope;
  const busy = useRef(false); const request = useRef(0);
  const [state, setState] = useState({ scope, rows: [] as AttendanceCorrectionWithHistory[], loading: true, error: '', outcome: '' });
  const refetch = useCallback(async () => {
    if (!store || !employeeId) { setState({ scope, rows: [], loading: false, error: '', outcome: '' }); return; }
    const version = ++request.current;
    const to = new Date(Date.now() + 32400000).toISOString().slice(0, 10);
    const from = new Date(Date.now() + 32400000 - 366 * 86400000).toISOString().slice(0, 10);
    try {
      const result = await getAttendanceCorrections({ storeId: store.id, employeeId, fromDate: from, toDate: to, pageSize: 200 });
      if (identity.current !== scope || request.current !== version) return;
      setState(old => ({ scope, rows: result.status === 'success' ? result.data.rows : [], loading: false,
        error: result.status === 'success' ? '' : '요청한 기록을 불러오지 못했어요. 다시 확인해주세요', outcome: old.scope === scope ? old.outcome : '' }));
    } catch { if (identity.current === scope) setState({ scope, rows: [], loading: false, error: '요청한 기록을 불러오지 못했어요', outcome: '' }); }
  }, [scope, store?.id, employeeId]);
  useEffect(() => { busy.current = false; void refetch(); return () => { request.current++; }; }, [refetch]);
  async function submit(args: Omit<AttendanceRpcArgs<'request_attendance_correction'>, 'p_store_id' | 'p_employee_id'>) {
    if (busy.current || !canWrite() || !store || !employeeId || devPreviewMode !== 'self' || identity.current !== scope || ['unknown', 'saving', 'saved'].includes(state.outcome)) return;
    busy.current = true;
    setState(old => ({ ...old, outcome: 'saving' }));
    try {
      const result = await requestAttendanceCorrection({ ...args, p_store_id: store.id, p_employee_id: employeeId });
      if (!canWrite() || identity.current !== scope) return;
      const outcome = result.status === 'success' ? 'saved' : result.status === 'unknown' ? 'unknown' : 'failed';
      setState(old => ({ ...old, outcome }));
      if (outcome === 'saved') await refetch();
    } catch { if (identity.current === scope) setState(old => ({ ...old, outcome: 'unknown' })); }
    finally { if (identity.current === scope) busy.current = false; }
  }
  async function cancel(id: string) {
    if (busy.current || !canWrite() || identity.current !== scope || devPreviewMode !== 'self' || ['unknown', 'saving'].includes(state.outcome) || !state.rows.some(row => row.id === id && row.status === 'pending')) return;
    busy.current = true; setState(old => ({ ...old, outcome: 'saving' }));
    try {
      const result = await cancelAttendanceCorrection({ p_request_id: id });
      if (!canWrite() || identity.current !== scope) return;
      setState(old => ({ ...old, outcome: result.status === 'success' ? 'cancelled' : result.status === 'unknown' ? 'unknown' : 'failed' }));
      if (result.status === 'success') await refetch();
    } catch { if (canWrite() && identity.current === scope) setState(old => ({ ...old, outcome: 'unknown' })); }
    finally { if (identity.current === scope) busy.current = false; }
  }
  return { ...(state.scope === scope ? state : { rows: [], loading: true, error: '', outcome: '' }), refetch, submit, cancel };
}
