/** 알려진 RPC 오류 코드만 반환하고 message/details/hint는 버린다. */
export const STORE_ACCESS_ERROR_CATEGORIES = {
  STORE_OWNER_REQUIRED: 'permission', STORE_ACCESS_DENIED: 'permission', FINANCIAL_SHARING_DENIED: 'permission',
  OWNERSHIP_OWNER_REQUIRED: 'permission', OWNERSHIP_TRANSFER_REQUIRED: 'permission',
  MANAGER_REVISION_CONFLICT: 'conflict', VISIBILITY_REVISION_CONFLICT: 'conflict',
  MANAGER_INPUT_INVALID: 'input', MANAGER_CANDIDATE_INVALID: 'input', INVALID_SHARE_SCOPE: 'input',
  VISIBILITY_INPUT_INVALID: 'input', SHARED_QUERY_INVALID: 'input',
  MANAGER_REVISION_INVALID: 'server', VISIBILITY_REVISION_INVALID: 'server',
  ATTENDANCE_OWNER_REQUIRED: 'permission', ATTENDANCE_ADMIN_REQUIRED: 'permission',
} as const;
export type StoreAccessError = { code: keyof typeof STORE_ACCESS_ERROR_CATEGORIES | 'STORE_REQUEST_UNKNOWN' | 'STORE_REQUEST_REJECTED' | 'STORE_REQUEST_INVALID'; category: 'permission' | 'conflict' | 'input' | 'server' | 'unknown' };
export function classifyStoreAccessError(error: unknown): StoreAccessError {
  const value = error as { code?: unknown; message?: unknown } | null;
  for (const token of [value?.message, value?.code]) {
    if (typeof token === 'string' && Object.prototype.hasOwnProperty.call(STORE_ACCESS_ERROR_CATEGORIES, token)) {
      const code = token as keyof typeof STORE_ACCESS_ERROR_CATEGORIES;
      return { code, category: STORE_ACCESS_ERROR_CATEGORIES[code] };
    }
  }
  if (value?.code === '42501') return { code: 'STORE_ACCESS_DENIED', category: 'permission' };
  if (typeof value?.code === 'string' && /^(?:[A-Z0-9]{5}|PGRST\d+)$/.test(value.code)) return { code: 'STORE_REQUEST_REJECTED', category: 'server' };
  return { code: 'STORE_REQUEST_UNKNOWN', category: 'unknown' };
}
export type StoreRequestResult<T> =
  | { status: 'success'; data: T; refreshRequired?: boolean }
  | { status: 'conflict'; error: StoreAccessError; refreshRequired: true }
  | { status: 'denied' | 'error' | 'unknown' | 'preflight_failed'; error: StoreAccessError };
