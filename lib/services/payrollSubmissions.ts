import { UserFacingError } from '../utils/error';
import { supabase } from '../supabase';
import { PayrollWorkSubmission } from '../../types';
import { parseWorkedMinutes } from '../utils/workMinutes';

export async function getPayrollSubmissions(storeId: string, yearMonth: string, employeeId?: string): Promise<PayrollWorkSubmission[]> {
  let query = supabase.from('payroll_work_submissions').select('*').eq('store_id', storeId)
    .eq('year_month', yearMonth).order('version', { ascending: false });
  if (employeeId) query = query.eq('employee_id', employeeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as PayrollWorkSubmission[];
}
export async function submitWorkMinutes(employeeId: string, yearMonth: string, minutes: string, note: string, previousId?: string): Promise<PayrollWorkSubmission> {
  const parsed = parseWorkedMinutes(minutes, yearMonth);
  if (!note.trim() || note.trim().length > 1000) throw new UserFacingError('입력 근거를 1~1000자로 작성해 주세요.');
  const { data, error } = await supabase.rpc('submit_work_minutes', { p_employee_id: employeeId, p_year_month: yearMonth,
    p_minutes: parsed, p_note: note.trim(), p_previous_id: previousId ?? null });
  if (error) throw new Error(error.message);
  return data as PayrollWorkSubmission;
}
export async function reviewWorkMinutes(id: string, status: 'approved' | 'rejected', note: string): Promise<PayrollWorkSubmission> {
  if (status === 'rejected' && !note.trim()) throw new UserFacingError('반려 사유를 적어 주세요.');
  const { data, error } = await supabase.rpc('review_work_minutes', { p_submission_id: id, p_status: status, p_note: note.trim() });
  if (error) throw new Error(error.message);
  return data as PayrollWorkSubmission;
}
