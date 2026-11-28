import { attendanceDisplay, workedText } from '../../lib/components/home/attendance/attendanceDisplay';
import { checklistDescription, tileCopy } from '../../lib/components/home/tasks/taskTiles';

describe('출퇴근 칸', () => {
  const start = { punched_at: '2026-11-26T00:02:00Z' }; // 09:02 KST
  it('출근 전에는 예정 시간과 출근하기를 보인다', () => {
    expect(attendanceDisplay({ schedule: { start_time: '09:00:00', end_time: '15:00:00' } }, 0))
      .toEqual({ label: '오늘 근무', value: '09:00 ~ 15:00', action: 'in' });
    expect(attendanceDisplay({ schedule: null }, 0).value).toBe('정해진 근무가 없어요');
  });
  it('근무 중에는 출근 시각과 일한 시간, 퇴근하기를 보인다', () => {
    const now = Date.parse('2026-11-26T05:20:00Z');
    expect(attendanceDisplay({ start }, now)).toEqual({ label: '출근 09:02 · 근무 중', value: '5시간 18분', action: 'out' });
  });
  it('퇴근 후에는 근무 시간대만 보이고 버튼을 두지 않는다', () => {
    expect(attendanceDisplay({ start, end: { punched_at: '2026-11-26T06:04:00Z' } }, 0))
      .toEqual({ label: '오늘 근무 끝', value: '09:02 ~ 15:04', action: null });
  });
  it('기기 시각이 앞서도 음수 시간을 만들지 않는다', () => {
    expect(workedText('2026-11-26T05:00:00Z', Date.parse('2026-11-26T04:00:00Z'))).toBe('0분');
  });
});

describe('할 일 타일', () => {
  it('체크리스트는 미등록·실패·불러오는 중을 완료로 보이지 않는다', () => {
    expect(checklistDescription({ kind: 'ready', count: { total: 0, done: 0 } })).toBe('체크 항목을 추가해요');
    expect(checklistDescription({ kind: 'error' })).toBe('확인 필요');
    expect(checklistDescription({ kind: 'loading' })).toBe('불러오는 중');
    expect(checklistDescription({ kind: 'ready', count: { total: 8, done: 3 } })).toBe('남은 5개 챙기고');
    expect(checklistDescription({ kind: 'ready', count: { total: 6, done: 6 } })).toBe('6개 모두 챙겼어요');
  });
  it('체크리스트가 아닌 타일은 진행 상태를 붙이지 않는다', () => {
    expect(tileCopy('purchase', { kind: 'error' }).description).toBe('오늘 들어온 물건 적고');
    expect(tileCopy('open_check', { kind: 'error' })).toMatchObject({ title: '오픈 준비 끝내기', description: '확인 필요', tone: 'blue' });
  });
});
