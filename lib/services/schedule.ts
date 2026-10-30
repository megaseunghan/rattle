import { invalidateCachedStore } from './cacheInvalidation';
import { supabase } from '../supabase';
import { EmployeeSchedule, ScheduleDayInput, ScheduleRequest } from '../../types';

export async function getEmployeeSchedule(employeeId: string): Promise<EmployeeSchedule[]> {
  const { data, error } = await supabase
    .from('employee_schedules')
    .select('*')
    .eq('employee_id', employeeId)
    .order('day_of_week', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as EmployeeSchedule[];
}

/** 매장 전체 직원 중 특정 요일에 근무하는 스케줄 (통합 대시보드 "오늘 스케줄"용) */
export async function getStoreScheduleForDay(
  storeId: string,
  dayOfWeek: number,
): Promise<(EmployeeSchedule & { employee_name: string })[]> {
  const { data, error } = await supabase
    .from('employee_schedules')
    .select('*, employees(name)')
    .eq('store_id', storeId)
    .eq('day_of_week', dayOfWeek)
    .eq('is_working', true)
    .order('start_time', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({ ...r, employee_name: r.employees?.name ?? '' }));
}

/** All working weekdays for one store, fetched once rather than once per weekday. */
export async function getStoreWeeklySchedule(storeId: string): Promise<(EmployeeSchedule & { employee_name: string })[]> {
  const { data, error } = await supabase.from('employee_schedules').select('*, employees(name)')
    .eq('store_id', storeId).eq('is_working', true).order('start_time', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: EmployeeSchedule & { employees: { name: string } | null }) => ({
    ...row, employee_name: row.employees?.name ?? '',
  }));
}

/** 아직 처리되지 않은(pending) 내 스케줄 변경 요청 1건 */
export async function getMyPendingScheduleRequest(employeeId: string): Promise<ScheduleRequest | null> {
  const { data, error } = await supabase
    .from('schedule_requests')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ScheduleRequest | null;
}

export async function submitScheduleRequest(
  storeId: string,
  employeeId: string,
  days: ScheduleDayInput[],
): Promise<ScheduleRequest> {
  const { data, error } = await supabase
    .from('schedule_requests')
    .insert({ store_id: storeId, employee_id: employeeId, days })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await invalidateCachedStore(storeId, ['schedule', 'notifications']);
  return data as ScheduleRequest;
}

/** 사장님용 — 매장의 대기 중인 스케줄 변경 요청 (직원명 포함) */
export async function getPendingScheduleRequests(
  storeId: string,
): Promise<(ScheduleRequest & { employee_name: string })[]> {
  const { data, error } = await supabase
    .from('schedule_requests')
    .select('*, employees(name)')
    .eq('store_id', storeId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({ ...r, employee_name: r.employees?.name ?? '' }));
}

export async function reviewScheduleRequest(
  request: ScheduleRequest,
  approve: boolean,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const reviewerId = auth.user?.id ?? null;

  let changed = false;
  try {
    if (approve) {
      const rows = request.days.map(d => ({
        store_id: request.store_id,
        employee_id: request.employee_id,
        day_of_week: d.day_of_week,
        is_working: d.is_working,
        start_time: d.start_time,
        end_time: d.end_time,
        updated_at: new Date().toISOString(),
      }));
      const { error: upsertError } = await supabase
        .from('employee_schedules')
        .upsert(rows, { onConflict: 'employee_id,day_of_week' });
      if (upsertError) throw new Error(upsertError.message);
      changed = true;
    }

    const { error } = await supabase
      .from('schedule_requests')
      .update({
        status: approve ? 'approved' : 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewerId,
      })
      .eq('id', request.id);
    if (error) throw new Error(error.message);
    changed = true;
  } finally {
    // Approved schedules may commit before the request-status update fails.
    if (changed) await invalidateCachedStore(request.store_id, ['schedule', 'notifications']);
  }

}
