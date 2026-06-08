import { supabase } from '../supabase';
import { Attendance, AttendanceType } from '../../types';
import { probationFactor } from './payroll';

const RADIUS_M = 40;

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

export function isWithinRadius(distanceM: number): boolean {
  return distanceM <= RADIUS_M;
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
  return data as Attendance;
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
