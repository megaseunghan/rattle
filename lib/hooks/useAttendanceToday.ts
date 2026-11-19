import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { getAttendancePunches } from '../services/attendance';
import { getEmployeeSchedule } from '../services/schedule';
import type { AttendancePunchWithEmployee, EmployeeSchedule } from '../../types';

export { attendanceTime } from './attendanceTime';

/** Latest work only; an earlier checkout must never be paired with a later check-in. */
export function latestAttendance(rows: AttendancePunchWithEmployee[]) {
  const ordered = [...rows].sort((a, b) => Date.parse(b.punched_at) - Date.parse(a.punched_at) || b.event_order - a.event_order);
  const latest = ordered[0];
  if (!latest) return { start: undefined, end: undefined };
  if (latest.kind === 'clock_in') return { start: latest, end: undefined };
  return { start: ordered.slice(1).find(row => row.kind === 'clock_in'), end: latest };
}

export function useAttendanceToday(employeeId?: string, active = true, refreshKey = 0) {
  const { user, store, permissionRevision, devPreviewMode, devPreviewEmployeeId } = useAuth();
  const [day, setDay] = useState(() => new Date(Date.now() + 32400000).toISOString().slice(0, 10));
  const scope = `${user?.id}:${store?.id}:${employeeId}:${permissionRevision}:${devPreviewMode}:${devPreviewEmployeeId}:${day}`;
  const current = useRef(scope); current.current = scope;
  const request = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const [state, setState] = useState({ scope, rows: [] as AttendancePunchWithEmployee[], schedule: null as EmployeeSchedule | null, loading: true, error: '', scheduleError: false });
  const refetch = useCallback(async (background = false) => {
    const version = ++request.current;
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    if (!store || !user || !employeeId) {
      setState({ scope, rows: [], schedule: null, loading: false, error: '', scheduleError: false }); return;
    }
    setState(old => ({ ...old, scope, rows: old.scope === scope ? old.rows : [], schedule: old.scope === scope ? old.schedule : null, loading: background && old.scope === scope ? old.loading : true, error: '' }));
    const [records, schedules] = await Promise.allSettled([
      getAttendancePunches({ storeId: store.id, employeeId, fromDate: new Date(Date.parse(`${day}T12:00:00Z`) - 86400000).toISOString().slice(0, 10), toDate: day, signal: controller.signal, pageSize: 200 }), getEmployeeSchedule(employeeId),
    ]);
    if (current.current !== scope || request.current !== version) return;
    const ok = records.status === 'fulfilled' && records.value.status === 'success';
    const kstWeekday = new Date(`${day}T12:00:00+09:00`).getUTCDay();
    const all = ok && records.status === 'fulfilled' && records.value.status === 'success' ? records.value.data.rows : [];
    const latest = latestAttendance(all);
    const includePrevious = latest.start && !latest.end && Date.now() - Date.parse(latest.start.punched_at) <= 16 * 3600000
      || latest.end && new Date(Date.parse(latest.end.punched_at) + 32400000).toISOString().slice(0, 10) === day;
    setState({ scope, rows: all.filter(row => row.work_date === day || includePrevious && (row.id === latest.start?.id || row.id === latest.end?.id)),
      schedule: schedules.status === 'fulfilled' ? schedules.value.find(row => row.day_of_week === kstWeekday && row.is_working) ?? null : null,
      loading: false, error: ok ? '' : '기록을 불러오지 못했어요. 잠시 후 다시 확인해주세요', scheduleError: schedules.status === 'rejected' });
  }, [scope, employeeId, store?.id, user?.id, day]);
  useEffect(() => { if (active) void refetch(); return () => { request.current++; abort.current?.abort(); }; }, [refetch, active, refreshKey]);
  useEffect(() => {
    const tick = () => setDay(new Date(Date.now() + 32400000).toISOString().slice(0, 10));
    const timer = setInterval(tick, 60000); const subscription = AppState.addEventListener('change', s => { if (s === 'active') { tick(); if (active) void refetch(); } });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [active, refetch]);
  const visible = state.scope === scope ? state : { ...state, rows: [], schedule: null, loading: true, error: '' };
  return { ...visible, ...latestAttendance(visible.rows), refetch, scope };
}
