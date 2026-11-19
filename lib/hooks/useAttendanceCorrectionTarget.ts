import { useEffect, useState } from 'react';
import type { AttendancePunchWithEmployee } from '../../types';
import { useAuth } from '../contexts/AuthContext';
import { getAttendancePunch } from '../services/attendance';

/** Notifications may refer to a missing checkout older than today's home card. */
export function useAttendanceCorrectionTarget(employeeId?: string, punchId?: string) {
  const { user, store, permissionRevision, devPreviewMode } = useAuth();
  const scope = `${user?.id}:${store?.id}:${employeeId}:${punchId}:${permissionRevision}:${devPreviewMode}`;
  const [state, setState] = useState({ scope, row: null as AttendancePunchWithEmployee | null, loading: false, error: '' });
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setState({ scope, row: null, loading: !!punchId, error: '' });
    if (!punchId || !employeeId || !store || !user) return () => { active = false; controller.abort(); };
    void getAttendancePunch(store.id, employeeId, punchId, controller.signal).then(result => {
      if (active) setState({ scope, row: result.status === 'success' ? result.data : null, loading: false,
        error: result.status === 'success' && result.data ? '' : '기록을 확인하지 못했어요. 출퇴근 기록에서 다시 선택해주세요' });
    }).catch(() => { if (active) setState({ scope, row: null, loading: false, error: '기록을 불러오지 못했어요. 잠시 후 다시 확인해주세요' }); });
    return () => { active = false; controller.abort(); };
  }, [scope, employeeId, punchId, store?.id, user?.id]);
  return state.scope === scope ? state : { row: null, loading: !!punchId, error: '' };
}
