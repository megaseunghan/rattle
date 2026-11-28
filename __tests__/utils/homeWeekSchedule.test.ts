import { axisRange, axisTicks, crewForDay, kstNow, position, shiftState, weekDays } from '../../lib/components/home/schedule/weekSchedule';
import type { Employee, EmployeeSchedule } from '../../types';

const employee = (id: string, name: string, type: 'regular' | 'part_time', active = true) =>
  ({ id, name, employment_type: type, is_active: active }) as Employee;
const schedule = (employee_id: string, dow: number, start: string | null, end: string | null, working = true) =>
  ({ id: `${employee_id}-${dow}`, store_id: 's', employee_id, day_of_week: dow, is_working: working, start_time: start, end_time: end, updated_at: '' }) as EmployeeSchedule;

it('이번 주는 월요일부터 일요일까지이고 오늘을 기준으로 지난 날·앞날을 나눈다', () => {
  const days = weekDays('2026-11-26');
  expect(days.map(day => day.letter)).toEqual(['월', '화', '수', '목', '금', '토', '일']);
  expect(days[0].date).toBe('2026-11-23'); expect(days[6]).toMatchObject({ date: '2026-11-29', dow: 0, kind: 'future' });
  expect(days[3].kind).toBe('today'); expect(days[2].kind).toBe('past');
});

it('재직자의 근무 요일만 출근 순으로 놓고 시간이 없는 근무는 뺀다', () => {
  const employees = [employee('a', '김하늘', 'part_time'), employee('b', '박서준', 'regular'), employee('c', '퇴사자', 'regular', false)];
  const rows = crewForDay([
    schedule('a', 3, '15:00:00', '22:00:00'), schedule('b', 3, '10:00:00', '18:00:00'),
    schedule('c', 3, '09:00:00', '12:00:00'), schedule('b', 4, '10:00:00', '18:00:00'),
    schedule('a', 3, null, null), schedule('missing', 3, '09:00:00', '10:00:00'),
  ], employees, 3);
  expect(rows.map(row => [row.name, row.type, row.label])).toEqual([
    ['박서준', 'staff', '10:00–18:00'], ['김하늘', 'part', '15:00–22:00'],
  ]);
});

it('자정을 넘기는 근무는 다음 날 시각까지 이어 그린다', () => {
  const [row] = crewForDay([schedule('a', 5, '18:00:00', '02:00:00')], [employee('a', '야간', 'part_time')], 5);
  expect(row.end).toBe(26 * 60); expect(row.label).toBe('18:00–02:00');
  expect(axisRange([row])).toEqual({ start: 18 * 60, end: 26 * 60 });
});

it('근무가 없으면 9~22시 축을 쓰고 눈금은 3시간 간격이다', () => {
  expect(axisRange([])).toEqual({ start: 540, end: 1320 });
  expect(axisTicks({ start: 540, end: 1320 }).map(tick => tick.label)).toEqual(['9', '12', '15', '18', '21']);
});

it('오늘 근무는 지금 시각으로, 지난 날은 끝남, 앞날은 예정으로 표시한다', () => {
  const row = { employeeId: 'a', name: 'a', type: 'staff' as const, start: 600, end: 1080, label: '' };
  expect(shiftState(row, 'today', 599)).toBe('wait'); expect(shiftState(row, 'today', 600)).toBe('on');
  expect(shiftState(row, 'today', 1080)).toBe('done'); expect(shiftState(row, 'past', 0)).toBe('done');
  expect(shiftState(row, 'future', 0)).toBe('plan');
  expect(position({ start: 540, end: 1320 }, row)).toEqual({ left: 60 / 780, width: 480 / 780 });
});

it('한국 시각으로 날짜와 분을 계산한다', () => {
  expect(kstNow(Date.parse('2026-11-26T15:30:00Z'))).toEqual({ date: '2026-11-27', minutes: 30 });
});
