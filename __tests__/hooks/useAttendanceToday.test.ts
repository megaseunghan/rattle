import { act, renderHook, waitFor } from '@testing-library/react-native';
import { latestAttendance, useAttendanceToday } from '../../lib/hooks/useAttendanceToday';
import type { AttendancePunchWithEmployee } from '../../types';
let mockStore = { id: 'store-a' };
const mockRecords = jest.fn(); const mockSchedule = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-a' }, store: mockStore, permissionRevision: '1', devPreviewMode: 'self' }) }));
jest.mock('../../lib/services/attendance', () => ({ getAttendancePunches: (...args: unknown[]) => mockRecords(...args) }));
jest.mock('../../lib/services/schedule', () => ({ getEmployeeSchedule: (...args: unknown[]) => mockSchedule(...args) }));
const punch = (id: string, kind: 'clock_in' | 'clock_out', time: string, event_order = 1) => ({ id, kind, event_order, punched_at: `2026-11-18T${time}:00+09:00` }) as AttendancePunchWithEmployee;
beforeEach(() => { mockStore = { id: 'store-a' }; mockRecords.mockReset().mockResolvedValue({ status: 'success', data: { rows: [], nextOffset: null } }); mockSchedule.mockReset().mockResolvedValue([]); });
it('재출근 뒤에는 이전 퇴근을 최신 근무와 짝짓지 않는다', () => {
  const a = punch('a', 'clock_in', '09:00'), b = punch('b', 'clock_out', '12:00'), c = punch('c', 'clock_in', '13:00');
  expect(latestAttendance([a, c, b])).toEqual({ start: c, end: undefined });
  const d = punch('d', 'clock_out', '15:00'); expect(latestAttendance([a, d, c, b])).toEqual({ start: c, end: d });
});
it('이전 매장에서 지연된 기록을 새 매장에 표시하지 않는다', async () => {
  let finish!: (value: unknown) => void;
  mockRecords.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { result, rerender } = renderHook(() => useAttendanceToday('employee'));
  mockStore = { id: 'store-b' }; rerender({});
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { finish({ status: 'success', data: { rows: [punch('old', 'clock_in', '09:00')], nextOffset: null } }); });
  expect(result.current.rows).toEqual([]);
});
it('조회 실패를 기록 없음으로 표시하지 않고 재조회할 수 있다', async () => {
  mockRecords.mockResolvedValueOnce({ status: 'unknown', error: { code: 'ATTENDANCE_TIMEOUT' } });
  const { result } = renderHook(() => useAttendanceToday('employee'));
  await waitFor(() => expect(result.current.error).toContain('불러오지 못했어요'));
  await act(async () => { await result.current.refetch(); }); expect(result.current.error).toBe('');
});

it('동일 시각의 확인된 0분 근무는 UUID 대신 서버 event_order로 짝짓는다', () => {
  const start = punch('zzzz', 'clock_in', '09:00', 1), end = punch('aaaa', 'clock_out', '09:00', 2);
  expect(latestAttendance([start, end])).toEqual({ start, end });
});
it('동일 시각 정정·재출근은 서버 순서의 최신 근무만 보여준다', () => {
  const first = punch('zzzz', 'clock_in', '09:00', 1), firstEnd = punch('yyyy', 'clock_out', '09:00', 2);
  const reentry = punch('bbbb', 'clock_in', '09:00', 3), correctedEnd = punch('aaaa', 'clock_out', '09:00', 4);
  expect(latestAttendance([firstEnd, reentry, first])).toEqual({ start: reentry, end: undefined });
  expect(latestAttendance([correctedEnd, first, reentry, firstEnd])).toEqual({ start: reentry, end: correctedEnd });
});
