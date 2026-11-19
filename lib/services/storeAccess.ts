import type { StoreAccess, StoreManagerState } from '../../types';
import { supabase } from '../supabase';
import { invalidateCachedStore } from './cacheInvalidation';
import { classifyStoreAccessError, StoreAccessError, StoreRequestResult } from './storeAccessErrors';
import { executeAttendance, AttendanceCallOptions } from './attendanceTransport';

export const STORE_ACCESS_CACHE_DOMAINS = { access: 'store-access', visibility: 'store-visibility',
  attendance: 'shared-attendance', requests: 'shared-attendance-requests', payroll: 'shared-payroll',
  employeePay: 'shared-employee-pay', financials: 'shared-financial-summary' } as const;
export const isRevision = (v: unknown): v is string => typeof v === 'string' && /^(0|[1-9]\d*)$/.test(v) && (v.length < 19 || (v.length === 19 && v <= '9223372036854775807'));
export const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export const isNullableString = (v: unknown): v is string | null => v === null || typeof v === 'string';
const capabilityKeys = ['is_owner','is_manager','can_manage_store','can_manage_managers','can_manage_visibility','can_transfer_ownership','can_delete_store','can_view_owner_dashboard'] as const;
export function closedStoreAccess(storeId: string): StoreAccess {
  return { store_id: storeId, role: null, employee_id: null, is_owner: false, is_manager: false,
    can_manage_store: false, can_manage_managers: false, can_manage_visibility: false, can_transfer_ownership: false,
    can_delete_store: false, can_view_owner_dashboard: false, manager_member_id: null, manager_employee_id: null, manager_revision: null };
}
export const invalidStoreRequest = (): StoreRequestResult<never> => ({ status: 'preflight_failed', error: { code: 'STORE_REQUEST_INVALID', category: 'input' } });
/** 공통 시간 초과·중단 처리를 재사용하고 권한 오류를 별도 분류한다. 자동 재시도하지 않는다. */
export async function storeRpc<T>(name: string, args: Record<string, unknown>, validate: (data: unknown) => boolean, options?: AttendanceCallOptions): Promise<StoreRequestResult<T>> {
  let serverError: StoreAccessError | undefined;
  const result = await executeAttendance<T>(() => {
    const builder = supabase.rpc(name, args);
    const capture = (pending: PromiseLike<{ data: unknown; error: unknown }>) => Promise.resolve(pending).then(response => {
      if (response.error) serverError = classifyStoreAccessError(response.error);
      return response;
    });
    // executeAttendance가 시작 신호를 연결한 뒤에만 thenable을 실행한다.
    return { then: (resolve, reject) => capture(builder).then(resolve, reject),
      abortSignal: (signal: AbortSignal) => capture(typeof builder.abortSignal === 'function' ? builder.abortSignal(signal) : builder) };
  }, options, validate);
  if (result.status === 'success') return result;
  if (serverError) {
    if (serverError.category === 'conflict') return { status: 'conflict', error: serverError, refreshRequired: true };
    return { status: serverError.category === 'permission' ? 'denied' : serverError.category === 'unknown' ? 'unknown' : 'error', error: serverError };
  }
  return { status: result.status === 'preflight_failed' ? 'preflight_failed' : 'unknown', error: { code: 'STORE_REQUEST_UNKNOWN', category: 'unknown' } };
}
export type MyStoreAccessResult = { status: 'success'; data: StoreAccess } | { status: 'unavailable'; data: StoreAccess; error: StoreAccessError };
export async function getMyStoreAccess(storeId: string, options?: AttendanceCallOptions): Promise<MyStoreAccessResult> {
  const result = storeId ? await storeRpc<Record<string, unknown>>('get_my_store_access', { p_store_id: storeId }, d =>
    isRecord(d) && d.store_id === storeId && (d.role === null || ['owner','manager','employee','part_timer'].includes(String(d.role)))
    && isRevision(d.manager_revision) && capabilityKeys.every(k => typeof d[k] === 'boolean')
    && ['employee_id','manager_member_id','manager_employee_id'].every(k => isNullableString(d[k])), options) : invalidStoreRequest();
  if (result.status !== 'success') return { status: 'unavailable', data: closedStoreAccess(storeId), error: result.error };
  const d = result.data;
  // 역할·권한이 불일치하면 모두 닫는다. raw admin·고용형태로 관리 권한을 추정하지 않는다.
  const owner = d.role === 'owner', manager = d.role === 'manager';
  if (d.is_owner !== owner || d.is_manager !== manager || d.can_manage_store !== (owner || manager)
    || ['can_manage_managers','can_manage_visibility','can_transfer_ownership','can_delete_store','can_view_owner_dashboard'].some(k => d[k] !== owner)) {
    return { status: 'unavailable', data: closedStoreAccess(storeId), error: { code: 'STORE_REQUEST_UNKNOWN', category: 'unknown' } };
  }
  const data = closedStoreAccess(storeId);
  for (const key of Object.keys(data) as (keyof StoreAccess)[]) Object.assign(data, { [key]: d[key] });
  return { status: 'success', data };
}
export async function invalidateAccessMutation<T>(storeId: string, result: StoreRequestResult<T>): Promise<StoreRequestResult<T>> {
  if (result.status === 'success') {
    try { await invalidateCachedStore(storeId); } catch { return { ...result, refreshRequired: true }; }
  } else if (result.status === 'conflict' || result.status === 'unknown') {
    try { await invalidateCachedStore(storeId); } catch { /* 결과불명을 저장 실패로 바꾸지 않는다. */ }
  }
  return result;
}
export async function setStoreManager(storeId: string, memberId: string | null, expectedRevision: string, options?: AttendanceCallOptions): Promise<StoreRequestResult<StoreManagerState>> {
  if (!storeId || !isRevision(expectedRevision) || !(memberId === null || typeof memberId === 'string' && memberId.length > 0)) return invalidStoreRequest();
  const result = await storeRpc<StoreManagerState>('set_store_manager', { p_store_id: storeId, p_member_id: memberId, p_expected_revision: expectedRevision }, d =>
    isRecord(d) && d.store_id === storeId && d.member_id === memberId && isRevision(d.revision)
    && ['member_id','employee_id','user_id','assigned_at'].every(k => isNullableString(d[k])), options);
  if (result.status === 'success') {
    const { store_id, member_id, employee_id, user_id, assigned_at, revision } = result.data;
    return invalidateAccessMutation(storeId, { status: 'success', data: { store_id, member_id, employee_id, user_id, assigned_at, revision } });
  }
  return invalidateAccessMutation(storeId, result);
}
