import { createContext, useContext, useSyncExternalStore } from 'react';
const listeners = new Set<() => void>();
let state: Record<string, any> = { scene: 'home', role: 'part_timer', variant: 'working', auto: 'unknown', manager: true, scanner: 'saved', outcome: '' };
export const change = (next: Record<string, any>) => { state = { ...state, ...next }; listeners.forEach(fn => fn()); };
export const useFixture = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state);
const noop = async () => {};
const defaultVisibility = { financial_share_scope: 'regular_only', attendance_share_scope: 'none', payroll_share_scope: 'none', visibility_revision: '1' };
const workflow = { open: ['open_check', 'stock', 'schedule'], business: ['stock', 'recipes'], close: ['close_check'] };
const employee = { id: 'fixture-person', store_id: 'fixture-store', user_id: 'fixture-user', name: '김하늘', employment_type: 'part_time', is_active: true, is_probation: false };
const people = [employee, { ...employee, id: 'lee', user_id: 'lee-user', name: '이지은', employment_type: 'regular' }, { ...employee, id: 'park', user_id: 'park-user', name: '박서준' }];
const members = people.map(person => ({ id: `${person.id}-member`, store_id: person.store_id, user_id: person.user_id, applicant_name: person.name, status: 'approved' }));
const start = { id: 'fixture-start', kind: 'clock_in', punched_at: '2026-11-18T09:02:00+09:00', work_date: '2026-11-18' };
const end = { id: 'fixture-end', kind: 'clock_out', punched_at: '2026-11-18T17:58:00+09:00', work_date: '2026-11-18' };
export function useAuth() {
  const s = useFixture();
  return { user: { id: 'fixture-user', user_metadata: { full_name: '김하늘' } }, store: { id: 'fixture-store', name: '래틀 행궁점', owner_id: s.role === 'owner' ? 'fixture-user' : 'owner-user' },
    storeRole: s.role, currentRole: ['owner', 'manager'].includes(s.role) ? 'admin' : 'member', realRole: 'admin', canManageStore: ['owner', 'manager'].includes(s.role),
    canReadFinancials: ['owner', 'manager'].includes(s.role), permissionRevision: 'fixture', devPreviewMode: 'self', devPreviewEmployeeId: null, access: { is_owner: s.role === 'owner' }, refreshStore: noop };
}
export function useEmployees() { const s = useFixture(); return { employees: people.map(p => p.id === employee.id ? { ...p, is_probation: s.variant === 'probation', employment_type: s.role === 'part_timer' ? 'part_time' : 'regular' } : p), loading: false, error: null, refetch: noop }; }
export function useAttendanceToday() {
  const s = useFixture(); const before = s.variant === 'before', finished = s.variant === 'finished';
  return { scope: 'fixture', start: before ? undefined : start, end: finished ? end : undefined, rows: before ? [] : finished ? [end, start] : [start], loading: false, error: '', scheduleError: false, schedule: { start_time: '09:00', end_time: '18:00' }, refetch: noop };
}
export const attendanceTime = (value?: string) => value ? new Date(value).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
export function useAttendanceQr() { return { state: 'ready', qr: 'OFFLINE-UI-VERIFICATION-NOT-AN-ATTENDANCE-CREDENTIAL', expiresAt: Date.now() + 60000, refresh: noop, register: noop }; }
export function useRoleSettings() {
 const s = useFixture(); return { allowed: s.role === 'owner', loading: false, error: '', outcome: s.outcome,
 access: { manager_member_id: s.manager ? 'lee-member' : null, manager_employee_id: s.manager ? 'lee' : null, manager_revision: '1' },
 visibility: s.visibility ?? defaultVisibility,
 refetch: noop, save: async (action: string, input: any) => change(action === 'manager' ? { manager: input !== null, outcome: 'saved' } : { visibility: input, outcome: 'saved' }) };
}
export const useStoreMembers = () => ({ members, loading: false, error: '', refetch: noop });
export const useConfirmLeave = () => () => {};
export const usePreviewWriteGuard = () => ({ canWrite: () => true, assertCanWrite: () => {} });
export const useScopedWriteGuard = () => () => true;
export const useDailyChecklistSummary = () => ({ data: { open: { total: 0, done: 0 }, close: { total: 0, done: 0 } }, isError: false, refetch: noop });
export const useHomeWorkflow = () => ({ data: workflow, isPending: false, isError: false, refetch: noop });
export const TabPagerContext = createContext<any>(null);
export const useTabPager = () => useContext(TabPagerContext) ?? { goToTab: () => {}, innerGestureActive: false };
export const useReducedTransparency = () => false;
export function useAttendanceCorrections() { const s = useFixture(); return { loading: false, error: '', outcome: s.outcome, rows: [], refetch: noop, submit: async () => change({ outcome: 'saved' }) }; }
export function useAttendanceScanner() { const s = useFixture(); const status = s.scanner; return { state: status, ready: status !== 'unregistered', unresolvedCount: Number(s.unresolvedCount ?? 0), confirmRegistrationRecovery: noop, canScan: false, scan: noop, clearNotice: () => {}, refresh: noop,
 title: status === 'saved' ? '김**님, 출근했어요' : status === 'unknown' ? '저장됐는지 확인하고 있어요' : status === 'revoked' ? '등록이 해제됐어요' : status === 'unregistered' ? '관리자 앱의 등록 QR을 찍어주세요' : '',
 body: status === 'unknown' ? '같은 QR을 다시 스캔해주세요' : status === 'revoked' ? '관리자 앱의 등록 QR을 다시 찍어주세요' : '', time: status === 'saved' ? '09:02' : '' }; }
export const useScannerPairing = () => ({ allowed: true, qr: 'OFFLINE-REGISTRATION-QR-NOT-A-CREDENTIAL', loading: false, error: '', expired: false, issue: noop });

// Read-only performance UI fixtures; real hook behavior is covered by Jest.
const empty: any[] = [];
const totals = { profit: 300000, revenue: 1000000, purchase: 300000, labor: 200000, expense: 200000 };
const financialData = { date: '2026-11-18', totals, hasRecords: true, current: Array.from({ length: 18 }, (_, index) => ({ day: index + 1, values: Object.fromEntries(Object.entries(totals).map(([key, amount]) => [key, Math.round(amount * (index + 1) / 18)])), hasRecords: true })), previous: empty };
export const useHomeFinancialCard = () => ({ data: financialData, loading: false, refreshing: false, error: false, refetch: noop });
export const useNotifications = () => ({ refetch: noop, unreadCount: 0, notifications: empty });
export const useHomeAlerts = () => ({ alerts: empty, loading: false, error: null, refetch: noop, markRead: noop });
export const useTossSync = () => ({ todaySales: 1000000, todayOrderCount: 42, lastSyncAt: null, error: null, autoSyncing: false, loadTodaySales: noop, autoSyncOnForeground: noop, autoSyncRecent: noop, syncByMonth: noop });
export const usePosAnalytics = () => ({ summaries: empty, items: empty, allItems: empty, categories: empty, loadingSummaries: false, loadingItems: false, error: null, fetchSummariesByRange: noop });
export const useManualSales = () => ({ sales: empty, loading: false, total: 0, ready: true, refreshing: false, error: null, actionError: null, removingId: null, refetch: noop, remove: noop });
