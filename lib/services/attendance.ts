import { supabase } from '../supabase';
import { Attendance, AttendanceType } from '../../types';

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
  const { data, error } = await supabase
    .from('attendance')
    .insert({ store_id: storeId, employee_id: employeeId, type: 'clock_out', latitude, longitude, distance_m: Math.round(distanceM) })
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
