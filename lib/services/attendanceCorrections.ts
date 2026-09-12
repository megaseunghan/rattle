import { supabase } from '../supabase';
import { AttendanceCorrection, CorrectionTarget } from '../../types';
import { probationFactor } from './payroll';

export interface SubmitCorrectionInput {
  storeId: string;
  employeeId: string;
  attendanceDate: string; // 'YYYY-MM-DD'
  target: CorrectionTarget;
  originalClockIn: string | null;
  originalClockOut: string | null;
  requestedClockIn: string | null;
  requestedClockOut: string | null;
  reason: string;
  photoUrl: string | null;
}

export async function submitCorrection(input: SubmitCorrectionInput): Promise<AttendanceCorrection> {
  const { data, error } = await supabase
    .from('attendance_corrections')
    .insert({
      store_id: input.storeId,
      employee_id: input.employeeId,
      attendance_date: input.attendanceDate,
      target: input.target,
      original_clock_in: input.originalClockIn,
      original_clock_out: input.originalClockOut,
      requested_clock_in: input.requestedClockIn,
      requested_clock_out: input.requestedClockOut,
      reason: input.reason,
      photo_url: input.photoUrl,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as AttendanceCorrection;
}

/** 사장님용 — 매장의 대기 중인 근태 정정 요청 (직원명 포함) */
export async function getPendingCorrections(
  storeId: string,
): Promise<(AttendanceCorrection & { employee_name: string })[]> {
  const { data, error } = await supabase
    .from('attendance_corrections')
    .select('*, employees(name)')
    .eq('store_id', storeId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({ ...r, employee_name: r.employees?.name ?? '' }));
}

/** 정정 승인 시 실제 attendance 기록에 반영. 퇴근 시각이 확정되면 근무 분·일급도 재계산 */
async function applyCorrectionToAttendance(correction: AttendanceCorrection): Promise<void> {
  const from = new Date(`${correction.attendance_date}T00:00:00`);
  const to = new Date(`${correction.attendance_date}T23:59:59`);

  const { data: existing, error: fetchError } = await supabase
    .from('attendance')
    .select('*')
    .eq('employee_id', correction.employee_id)
    .gte('timestamp', from.toISOString())
    .lte('timestamp', to.toISOString())
    .order('timestamp', { ascending: true });
  if (fetchError) throw new Error(fetchError.message);

  const clockInRow = (existing ?? []).find((r: any) => r.type === 'clock_in');
  const clockOutRow = (existing ?? []).find((r: any) => r.type === 'clock_out');

  const finalClockIn = correction.requested_clock_in ?? clockInRow?.timestamp ?? null;
  const finalClockOut = correction.requested_clock_out ?? clockOutRow?.timestamp ?? null;

  let workedMinutes: number | null = null;
  let dailyWage: number | null = null;
  if (finalClockIn && finalClockOut) {
    workedMinutes = Math.max(0, Math.round((new Date(finalClockOut).getTime() - new Date(finalClockIn).getTime()) / 60000));
    const { data: emp } = await supabase
      .from('employees')
      .select('hourly_wage, joined_at, is_resigned_during_probation')
      .eq('id', correction.employee_id)
      .maybeSingle();
    const hourly = emp?.hourly_wage != null ? Number(emp.hourly_wage) : null;
    if (hourly != null) {
      const factor = probationFactor({
        joined_at: emp?.joined_at ?? null,
        is_resigned_during_probation: emp?.is_resigned_during_probation ?? false,
      });
      dailyWage = Math.round((hourly / 60) * workedMinutes * factor);
    }
  }

  if (correction.requested_clock_in) {
    if (clockInRow) {
      await supabase.from('attendance').update({ timestamp: correction.requested_clock_in }).eq('id', clockInRow.id);
    } else {
      await supabase.from('attendance').insert({
        store_id: correction.store_id, employee_id: correction.employee_id, type: 'clock_in',
        timestamp: correction.requested_clock_in, latitude: 0, longitude: 0, distance_m: 0,
        note: '근태 정정 요청 승인으로 생성됨',
      });
    }
  }

  if (correction.requested_clock_out) {
    if (clockOutRow) {
      await supabase.from('attendance').update({
        timestamp: correction.requested_clock_out, worked_minutes: workedMinutes, daily_wage: dailyWage,
      }).eq('id', clockOutRow.id);
    } else {
      await supabase.from('attendance').insert({
        store_id: correction.store_id, employee_id: correction.employee_id, type: 'clock_out',
        timestamp: correction.requested_clock_out, latitude: 0, longitude: 0, distance_m: 0,
        worked_minutes: workedMinutes, daily_wage: dailyWage,
        note: '근태 정정 요청 승인으로 생성됨',
      });
    }
  } else if (clockOutRow && finalClockIn && finalClockOut) {
    // 출근만 정정됐지만 기존 퇴근 기록이 있으면 근무 분/일급 재계산
    await supabase.from('attendance').update({ worked_minutes: workedMinutes, daily_wage: dailyWage }).eq('id', clockOutRow.id);
  }
}

export async function reviewCorrection(correction: AttendanceCorrection, approve: boolean): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const reviewerId = auth.user?.id ?? null;

  if (approve) {
    await applyCorrectionToAttendance(correction);
  }

  const { error } = await supabase
    .from('attendance_corrections')
    .update({
      status: approve ? 'approved' : 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId,
    })
    .eq('id', correction.id);
  if (error) throw new Error(error.message);
}
