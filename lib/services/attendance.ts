import { supabase } from '../supabase';
import { Attendance, AttendanceType } from '../../types';
import { probationFactor } from './payroll';
import { getEmployeeSchedule } from './schedule';
import { notifyIfEnabled } from './notifications';

export const DEFAULT_ATTENDANCE_RADIUS_M = 40;

/** Haversine 공식 — 두 GPS 좌표 간 거리(m) */
export function calcDistanceM(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 매장별로 설정된 허용 반경(m) 기준으로 판정. 미설정 매장은 기본 40m */
export function isWithinRadius(distanceM: number, radiusM: number = DEFAULT_ATTENDANCE_RADIUS_M): boolean {
  return distanceM <= radiusM;
}

export async function clockIn(
  storeId: string,
  employeeId: string,
  latitude: number,
  longitude: number,
  distanceM: number,
): Promise<Attendance> {
  const { data, error } = await supabase
    .from('attendance')
    .insert({ store_id: storeId, employee_id: employeeId, type: 'clock_in', latitude, longitude, distance_m: Math.round(distanceM) })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const record = data as Attendance;
  checkLateAndNotify(storeId, employeeId, record.timestamp).catch(() => {});
  return record;
}

/** 스케줄 시작 시각보다 1분이라도 늦게 출근하면 지각 알림 생성 (설정 꺼져 있으면 조용히 무시) */
async function checkLateAndNotify(storeId: string, employeeId: string, clockInIso: string): Promise<void> {
  const clockInAt = new Date(clockInIso);
  const todayWeekday = clockInAt.getDay();
  const [schedule, { data: emp }] = await Promise.all([
    getEmployeeSchedule(employeeId),
    supabase.from('employees').select('name').eq('id', employeeId).maybeSingle(),
  ]);
  const todaySchedule = schedule.find(s => s.day_of_week === todayWeekday && s.is_working && s.start_time);
  if (!todaySchedule?.start_time) return;

  const [h, m] = todaySchedule.start_time.split(':').map(Number);
  const startMin = h * 60 + m;
  const actualMin = clockInAt.getHours() * 60 + clockInAt.getMinutes();
  if (actualMin <= startMin) return;

  const empName = (emp as { name?: string } | null)?.name ?? '직원';
  const timeLabel = clockInAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  await notifyIfEnabled({
    storeId,
    settingKey: 'attendance_late',
    category: 'attendance',
    type: 'late',
    title: '지각',
    message: `${empName}님이 ${timeLabel}에 지각했어요`,
    dedupeKey: `late:${employeeId}:${clockInIso.slice(0, 10)}`,
  });
}

export async function clockOut(
  storeId: string,
  employeeId: string,
  latitude: number,
  longitude: number,
  distanceM: number,
): Promise<Attendance> {
  // 오늘 출근 기록 + 직원 시급 조회 → 근무 분·일일급여 즉시 계산
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [{ data: ins }, { data: emp }] = await Promise.all([
    supabase
      .from('attendance')
      .select('timestamp')
      .eq('store_id', storeId)
      .eq('employee_id', employeeId)
      .eq('type', 'clock_in')
      .gte('timestamp', today.toISOString())
      .order('timestamp', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('employees')
      .select('hourly_wage, joined_at, is_resigned_during_probation')
      .eq('id', employeeId)
      .maybeSingle(),
  ]);

  const now = new Date();
  let workedMinutes: number | null = null;
  let dailyWage: number | null = null;
  if (ins?.timestamp) {
    workedMinutes = Math.max(0, Math.round((now.getTime() - new Date(ins.timestamp).getTime()) / 60000));
    const hourly = emp?.hourly_wage != null ? Number(emp.hourly_wage) : null;
    if (hourly != null) {
      // 수습 기간이면 일일급에도 90%(중도퇴사 80%) 적용
      const factor = probationFactor({
        joined_at: emp?.joined_at ?? null,
        is_resigned_during_probation: emp?.is_resigned_during_probation ?? false,
      });
      dailyWage = Math.round((hourly / 60) * workedMinutes * factor);
    }
  }

  const { data, error } = await supabase
    .from('attendance')
    .insert({
      store_id: storeId, employee_id: employeeId, type: 'clock_out',
      latitude, longitude, distance_m: Math.round(distanceM),
      worked_minutes: workedMinutes, daily_wage: dailyWage,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Attendance;
}

export async function getTodayAttendance(
  storeId: string,
  employeeId: string,
): Promise<Attendance[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('store_id', storeId)
    .eq('employee_id', employeeId)
    .gte('timestamp', today.toISOString())
    .order('timestamp', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Attendance[];
}

/** 월별·직원별 일급 누적 집계 (영업일 범위 = 손익계산서와 동일) */
export async function getMonthlyWageByEmployee(
  storeId: string,
  yearMonth: string, // 'YYYY-MM'
  closingTime: string, // 'HH:mm'
): Promise<Record<string, { totalWage: number; totalMinutes: number; days: number }>> {
  const [h, m] = closingTime.split(':').map(Number);
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));

  const from = new Date(year, month - 1, 0);
  from.setHours(h, m, 0, 0);
  const to = new Date(year, month, 0);
  to.setHours(h, m, 0, 0);
  if (to > new Date()) to.setTime(Date.now());

  const { data, error } = await supabase
    .from('attendance')
    .select('employee_id, daily_wage, worked_minutes')
    .eq('store_id', storeId)
    .eq('type', 'clock_out')
    .gte('timestamp', from.toISOString())
    .lte('timestamp', to.toISOString());
  if (error) throw new Error(error.message);

  const result: Record<string, { totalWage: number; totalMinutes: number; days: number }> = {};
  for (const r of (data ?? []) as any[]) {
    if (!r.employee_id) continue;
    const acc = result[r.employee_id] ?? { totalWage: 0, totalMinutes: 0, days: 0 };
    acc.totalWage += Number(r.daily_wage ?? 0);
    acc.totalMinutes += Number(r.worked_minutes ?? 0);
    acc.days += 1;
    result[r.employee_id] = acc;
  }
  return result;
}

/** 특정 직원의 월간 출퇴근 기록 (캘린더용) — 달력 월 기준 */
export async function getMonthlyAttendanceRecords(
  storeId: string,
  employeeId: string,
  year: number,
  month: number, // 1-12
): Promise<Attendance[]> {
  const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const to = new Date(year, month, 0, 23, 59, 59, 999);
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('store_id', storeId)
    .eq('employee_id', employeeId)
    .gte('timestamp', from.toISOString())
    .lte('timestamp', to.toISOString())
    .order('timestamp', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Attendance[];
}

export async function getAttendanceByDate(
  storeId: string,
  date: string, // 'YYYY-MM-DD'
): Promise<(Attendance & { employee_name?: string })[]> {
  const from = new Date(`${date}T00:00:00`);
  const to   = new Date(`${date}T23:59:59`);
  const { data, error } = await supabase
    .from('attendance')
    .select('*, employees(name)')
    .eq('store_id', storeId)
    .gte('timestamp', from.toISOString())
    .lte('timestamp', to.toISOString())
    .order('timestamp', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({ ...r, employee_name: r.employees?.name }));
}

export async function updateStoreLocation(
  storeId: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  const { data, error } = await supabase
    .from('stores')
    .update({ latitude, longitude })
    .eq('id', storeId)
    .select('id, latitude, longitude');

  if (error) throw new Error(`저장 실패: ${error.message} (code: ${error.code})`);
  if (!data || data.length === 0) {
    throw new Error('위치 저장 권한이 없거나 매장을 찾을 수 없습니다. Supabase RLS 정책을 확인해주세요.');
  }
}

/** 매장 정보 화면(GPS 기준점+허용 반경+출근 규칙)을 한 번에 저장 */
export async function updateStoreAttendanceSettings(
  storeId: string,
  settings: {
    name: string;
    address: string | null;
    latitude: number;
    longitude: number;
    radiusM: number;
    blockOutside: boolean;
  },
): Promise<void> {
  const { data, error } = await supabase
    .from('stores')
    .update({
      name: settings.name,
      address: settings.address,
      latitude: settings.latitude,
      longitude: settings.longitude,
      attendance_radius_m: settings.radiusM,
      attendance_block_outside: settings.blockOutside,
    })
    .eq('id', storeId)
    .select('id');

  if (error) throw new Error(`저장 실패: ${error.message} (code: ${error.code})`);
  if (!data || data.length === 0) {
    throw new Error('저장 권한이 없거나 매장을 찾을 수 없습니다.');
  }
}
