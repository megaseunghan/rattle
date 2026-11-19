import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getAttendanceWorkFailures, retryAttendanceWorkRecord } from '../services/attendanceWorkRecord';
import { useScopedWriteGuard } from './useScopedWriteGuard';
import type { AttendanceWorkFailure } from '../../types';

/** Owner/manager-only read model; failures never trigger employee-facing retries. */
export function useAttendanceWorkFailures(yearMonth: string, active: boolean) {
  const { user, store, canManageStore, devPreviewMode, permissionRevision } = useAuth();
  const allowed = !!user && !!store && canManageStore && devPreviewMode === 'self' && active;
  const scope = `${user?.id}:${store?.id}:${permissionRevision}:${devPreviewMode}:${canManageStore}:${yearMonth}`;
  const identity = useRef(scope); identity.current = scope;
  const visible = useRef(allowed); visible.current = allowed;
  const canWrite = useScopedWriteGuard([yearMonth]);
  const retryLock = useRef(false), writeAbort = useRef<AbortController | null>(null);
  const uncertain = useRef(new Set<string>());
  const [retryInfo, setRetryInfo] = useState({ scope, key: '', message: '' });
  const request = useRef(0), abort = useRef<AbortController | null>(null), busy = useRef(false);
  const [state, setState] = useState({ scope, rows: [] as AttendanceWorkFailure[], loading: false, error: '', nextOffset: null as number | null, limitReached: false });
  const load = useCallback(async (offset = 0) => {
    if (!allowed || !visible.current || identity.current !== scope || busy.current || !store) return;
    busy.current = true;
    const version = ++request.current; abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    setState(old => ({ scope, rows: offset && old.scope === scope ? old.rows : [], loading: true, error: '', nextOffset: null, limitReached: false }));
    try {
      const result = await getAttendanceWorkFailures({ storeId: store.id, yearMonth, offset, pageSize: 50 }, { signal: controller.signal });
      if (controller.signal.aborted || version !== request.current || identity.current !== scope || !visible.current) return;
      if (result.status !== 'success') throw new Error('read failed');
      setState(old => ({ scope, rows: offset ? [...old.rows, ...result.data.rows] : result.data.rows, loading: false, error: '', nextOffset: result.data.nextOffset, limitReached: result.data.limitReached === true }));
    } catch {
      if (!controller.signal.aborted && version === request.current && identity.current === scope && visible.current)
        setState({ scope, rows: [], loading: false, error: '확인이 필요한 근무를 불러오지 못했어요. 다시 확인해주세요', nextOffset: null, limitReached: false });
    } finally { if (version === request.current) busy.current = false; }
  }, [allowed, scope, store?.id, yearMonth]);
  const retry = useCallback(async (key: string) => {
    if (!allowed || !visible.current || !canWrite() || identity.current !== scope || state.scope !== scope || retryLock.current || !store) return;
    const row = state.rows.find(item => `${item.employee_id}:${item.work_date}` === key);
    if (!row?.retry_punch_id) return;
    const punchId = row.retry_punch_id;
    const previousUnknown = uncertain.current.has(punchId);
    // A tab change can abort the response after the server committed the write.
    uncertain.current.add(punchId);
    retryLock.current = true;
    const controller = new AbortController(); writeAbort.current = controller;
    setRetryInfo({ scope, key, message: '' });
    const current = () => !controller.signal.aborted && visible.current && canWrite() && identity.current === scope;
    try {
      const result = await retryAttendanceWorkRecord(store.id, punchId, { signal: controller.signal,
        ...(previousUnknown ? { previousOutcome: 'unknown' as const } : {}) });
      if (!current()) return;
      if (result.status === 'unknown') uncertain.current.add(punchId);
      else if (result.status === 'success') uncertain.current.delete(punchId);
      const message = result.status === 'unknown' ? '반영됐는지 확인하고 있어요. 다시 확인해주세요' : result.status === 'success' && result.data.state === 'completed'
        ? '인건비에 반영했어요' : '아직 반영하지 못했어요. 급여 조건을 확인해주세요';
      setRetryInfo({ scope, key: '', message });
      await load();
    } catch {
      if (current()) { uncertain.current.add(punchId); setRetryInfo({ scope, key: '', message: '반영됐는지 확인하고 있어요. 다시 확인해주세요' }); }
    } finally { if (writeAbort.current === controller) { retryLock.current = false; writeAbort.current = null; } }
  }, [allowed, scope, state.scope, state.rows, store?.id, canWrite, load]);
  useEffect(() => { uncertain.current.clear(); }, [scope]);
  useEffect(() => {
    retryLock.current = false;
    busy.current = false;
    if (allowed) void load();
    return () => { request.current++; abort.current?.abort(); writeAbort.current?.abort(); writeAbort.current = null; retryLock.current = false; busy.current = false; };
  }, [allowed, load]);
  const current = allowed && state.scope === scope;
  return { rows: current ? state.rows : [], loading: allowed && (!current || state.loading), error: current ? state.error : '',
    limitReached: current && state.limitReached, retry, retryingId: current && retryInfo.scope === scope ? retryInfo.key : '',
    retryMessage: current && retryInfo.scope === scope ? retryInfo.message : '', isRetryUnknown: (punchId: string) => uncertain.current.has(punchId),
    hasMore: current && state.nextOffset !== null, refetch: () => load(), loadMore: () => state.nextOffset === null ? Promise.resolve() : load(state.nextOffset) };
}
