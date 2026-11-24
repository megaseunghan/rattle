import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { queryClient, queryKeys, useQueryScope } from '../query';
import { STALE_TIME } from '../query/staleTimes';
import { getAttendancePunches } from '../services/attendance';
import { getEmployeeSchedule } from '../services/schedule';
import type { AttendancePunchWithEmployee } from '../../types';

export { attendanceTime } from './attendanceTime';

const KST_OFFSET_MS = 32_400_000;
const DAY_MS = 86_400_000;
const OPEN_SHIFT_WINDOW_MS = 16 * 3_600_000;
const DAY_TICK_MS = 60_000;
const READ_ERROR = '기록을 불러오지 못했어요. 잠시 후 다시 확인해주세요';
const kstDay = () => new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);

/** Latest work only; an earlier checkout must never be paired with a later check-in. */
export function latestAttendance(rows: AttendancePunchWithEmployee[]) {
  const ordered = [...rows].sort((a, b) => Date.parse(b.punched_at) - Date.parse(a.punched_at) || b.event_order - a.event_order);
  const latest = ordered[0];
  if (!latest) return { start: undefined, end: undefined };
  if (latest.kind === 'clock_in') return { start: latest, end: undefined };
  return { start: ordered.slice(1).find(row => row.kind === 'clock_in'), end: latest };
}

/** 오늘 근무와, 자정을 넘긴 진행 중 근무(또는 오늘 끝난 어제 출근)만 남긴다. */
function todayRows(all: AttendancePunchWithEmployee[], day: string): AttendancePunchWithEmployee[] {
  const latest = latestAttendance(all);
  const includePrevious = latest.start && !latest.end && Date.now() - Date.parse(latest.start.punched_at) <= OPEN_SHIFT_WINDOW_MS
    || latest.end && new Date(Date.parse(latest.end.punched_at) + KST_OFFSET_MS).toISOString().slice(0, 10) === day;
  return all.filter(row => row.work_date === day || includePrevious && (row.id === latest.start?.id || row.id === latest.end?.id));
}

/**
 * 오늘 내 출퇴근(1분 재사용)과 내 스케줄(30분 재사용).
 * 출퇴근 키는 기존 무효화 도메인 'attendance-punches'를 써서 정정·근무 저장 무효화를 그대로 받는다.
 * pollMs를 주면 화면이 활성일 때만 같은 키를 주기적으로 갱신한다(내 QR 화면). 같은 키를 보는 홈 카드도 함께 갱신된다.
 */
export function useAttendanceToday(employeeId?: string, active = true, refreshKey = 0, pollMs?: number) {
  const { store, user } = useAuth();
  const accessScope = useQueryScope();
  const [day, setDay] = useState(kstDay);
  const storeId = store?.id ?? '';
  const enabled = active && !!store && !!user && !!employeeId;

  const punches = useQuery({
    queryKey: queryKeys.store(accessScope, storeId, 'attendance-punches', 'today', employeeId ?? '', day),
    queryFn: async ({ signal }) => {
      const fromDate = new Date(Date.parse(`${day}T12:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
      const result = await getAttendancePunches({ storeId, employeeId, fromDate, toDate: day, signal, pageSize: 200 });
      if (result.status !== 'success') throw new Error(READ_ERROR);
      return todayRows(result.data.rows, day);
    },
    // 내 QR 화면(pollMs)은 들어오자마자 최신 상태를 받는다. 홈 카드는 1분 재사용한다.
    enabled, staleTime: STALE_TIME.homeStatus, refetchInterval: enabled && pollMs ? pollMs : false, refetchOnMount: pollMs ? 'always' : true,
  }, queryClient);
  const schedules = useQuery({
    queryKey: queryKeys.store(accessScope, storeId, 'schedule', 'employee', employeeId ?? ''),
    queryFn: () => getEmployeeSchedule(employeeId!), enabled, staleTime: STALE_TIME.config,
  }, queryClient);

  const { refetch: refetchPunches } = punches;
  const { refetch: refetchSchedules } = schedules;
  /** 당겨서 새로고침·다시 시도: 재사용 시간과 무관하게 다시 받는다. */
  const refetch = useCallback(async () => {
    if (!employeeId || !store || !user) return;
    await Promise.all([refetchPunches(), refetchSchedules()]);
  }, [employeeId, store?.id, user?.id, refetchPunches, refetchSchedules]);
  const lastRefresh = useRef(refreshKey);
  useEffect(() => {
    if (lastRefresh.current === refreshKey) return;
    lastRefresh.current = refreshKey;
    if (active) void refetch();
  }, [refreshKey, active, refetch]);

  // 날짜만 바꾼다. 앱 복귀 때 다시 받기는 focusManager(refetchOnWindowFocus, stale일 때만)가 맡는다.
  useEffect(() => {
    const tick = () => setDay(kstDay());
    const timer = setInterval(tick, DAY_TICK_MS);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') tick(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);

  const hasTarget = !!store && !!user && !!employeeId;
  const rows = hasTarget ? punches.data ?? [] : [];
  const kstWeekday = new Date(`${day}T12:00:00+09:00`).getUTCDay();
  const schedule = hasTarget ? schedules.data?.find(row => row.day_of_week === kstWeekday && row.is_working) ?? null : null;
  const loading = hasTarget && punches.isPending && !punches.isError;
  const error = hasTarget && punches.isError ? READ_ERROR : '';
  const scope = JSON.stringify([accessScope, storeId, employeeId ?? null, day]);
  return { scope, rows, schedule, loading, error, scheduleError: hasTarget && schedules.isError, ...latestAttendance(rows), refetch };
}
