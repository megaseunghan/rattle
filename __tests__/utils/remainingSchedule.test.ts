import { remainingScheduledDays } from '../../lib/utils/remainingSchedule';
import { ScheduleDayInput } from '../../types';
const shift = (day: number, start = '10:00:00', end = '19:00:00'): ScheduleDayInput => ({ day_of_week: day, is_working: true, start_time: start, end_time: end });
const count = (rows: ScheduleDayInput[], utc: string) => remainingScheduledDays(rows, new Date(utc));
it('KST 종료 정각부터 오늘을 제외하고 이후 근무는 포함한다', () => {
 const rows = [shift(3), shift(4)];
 expect(count(rows, '2026-11-11T09:59:59Z')).toBe(2);
 expect(count(rows, '2026-11-11T10:00:00Z')).toBe(1);
});
it('월요일이 시작되면 새 주를 계산하고 일요일 종료 후에는 0이다', () => {
 const rows = [shift(1), shift(0)];
 expect(count(rows, '2026-11-15T14:59:59Z')).toBe(0);
 expect(count(rows, '2026-11-15T15:00:00Z')).toBe(2);
});
it('익일 종료 근무는 자정을 지나도 종료 전까지 포함한다', () => {
 const rows = [shift(5,'18:00:00','02:00:00')];
 expect(count(rows, '2026-11-13T16:59:59Z')).toBe(1);
 expect(count(rows, '2026-11-13T17:00:00Z')).toBe(0);
});
it('누락·잘못된 시간은 완료로 만들지 않는다', () => {
 expect(count([], '2026-11-09T00:00:00Z')).toBeNull();
 expect(count([{...shift(3),end_time:null}], '2026-11-09T00:00:00Z')).toBeNull();
 expect(count([shift(3,'25:00:00')], '2026-11-09T00:00:00Z')).toBeNull();
 expect(count([shift(3,'10:00:00','10:00:00')], '2026-11-09T00:00:00Z')).toBeNull();
});
it('휴무만 등록된 주는 0이며 불완전한 휴무 시간은 집계하지 않는다', () => {
 expect(count([{...shift(3),is_working:false,start_time:null,end_time:null}], '2026-11-09T00:00:00Z')).toBe(0);
});
