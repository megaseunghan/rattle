import {
  adjustForDayOff, describePaySchedule, findPaydayAlert, formatMonthDayWeekday, isSameMonthPayAllowed, kstToday,
  normalizeMonthOffset, paydayAlertCopy, paydayFor, paydayRowLabel, resolveDay, type PaydaySettings,
} from '../../lib/utils/payday';

const LAST = 0;
const base: PaydaySettings = { closeDay: LAST, monthOffset: 1, payDay: 10, holidayRule: 'before' };

describe('resolveDay', () => {
  test('말일은 그 달의 마지막 날이다', () => {
    expect(resolveDay(2026, 1, LAST)).toBe(31);
    expect(resolveDay(2026, 4, LAST)).toBe(30);
  });
  test('2월 말일은 평년 28일, 윤년 29일이다', () => {
    expect(resolveDay(2026, 2, LAST)).toBe(28);
    expect(resolveDay(2028, 2, LAST)).toBe(29);
  });
  test('29일은 평년 2월에 28일로 당기고 윤년엔 그대로 둔다', () => {
    expect(resolveDay(2027, 2, 29)).toBe(28);
    expect(resolveDay(2028, 2, 29)).toBe(29);
  });
});

describe('adjustForDayOff', () => {
  // 2026-12-12 토, 2026-12-13 일
  test('앞당겨서는 바로 앞 금요일로 옮긴다', () => {
    expect(adjustForDayOff('2026-12-12', 'before')).toBe('2026-12-11');
    expect(adjustForDayOff('2026-12-13', 'before')).toBe('2026-12-11');
  });
  test('미뤄서는 바로 다음 월요일로 옮긴다', () => {
    expect(adjustForDayOff('2026-12-12', 'after')).toBe('2026-12-14');
    expect(adjustForDayOff('2026-12-13', 'after')).toBe('2026-12-14');
  });
  test('그날 그대로는 옮기지 않는다', () => {
    expect(adjustForDayOff('2026-12-13', 'same')).toBe('2026-12-13');
  });
  test('평일이면 어떤 규칙이든 그대로다', () => {
    expect(adjustForDayOff('2026-12-10', 'before')).toBe('2026-12-10');
    expect(adjustForDayOff('2026-12-10', 'after')).toBe('2026-12-10');
  });
  test('앞당기다 달이 바뀌어도 앞 평일로 간다', () => {
    // 2026-08-01 토 → 2026-07-31 금
    expect(adjustForDayOff('2026-08-01', 'before')).toBe('2026-07-31');
  });
});

describe('paydayFor', () => {
  test('말일 마감·다음 달 10일: 11월 근무분은 12월 10일(목)', () => {
    expect(paydayFor(base, 2026, 11)).toEqual({ date: '2026-12-10', scheduled: '2026-12-10', workYear: 2026, workMonth: 11 });
  });
  test('다음 달 계산은 해를 넘긴다', () => {
    expect(paydayFor(base, 2026, 12).scheduled).toBe('2027-01-10');
  });
  test('같은 달 말일 지급은 2월에 28일이고 쉬는 날이면 앞당긴다', () => {
    // 2027-02-28 일 → 2027-02-26 금
    const settings: PaydaySettings = { closeDay: 15, monthOffset: 0, payDay: LAST, holidayRule: 'before' };
    expect(paydayFor(settings, 2027, 2)).toMatchObject({ scheduled: '2027-02-28', date: '2027-02-26' });
  });
  test('윤년 2월 29일 지급', () => {
    const settings: PaydaySettings = { closeDay: 10, monthOffset: 1, payDay: 29, holidayRule: 'same' };
    expect(paydayFor(settings, 2028, 1).date).toBe('2028-02-29');
    expect(paydayFor(settings, 2027, 1).date).toBe('2027-02-28');
  });
});

describe('findPaydayAlert', () => {
  test('3일 전이면 d3', () => {
    expect(findPaydayAlert(base, '2026-12-07')).toMatchObject({ kind: 'd3', date: '2026-12-10', workMonth: 11 });
  });
  test('4일 전·2일 전·1일 뒤는 알리지 않는다', () => {
    expect(findPaydayAlert(base, '2026-12-06')).toBeNull();
    expect(findPaydayAlert(base, '2026-12-08')).toBeNull();
    expect(findPaydayAlert(base, '2026-12-11')).toBeNull();
  });
  test('당일이면 today', () => {
    expect(findPaydayAlert(base, '2026-12-10')).toMatchObject({ kind: 'today', workMonth: 11 });
  });
  test('쉬는 날로 옮긴 날을 기준으로 센다', () => {
    // 2027-01-10 일 → 앞당겨 2027-01-08 금. 3일 전은 2027-01-05.
    expect(findPaydayAlert(base, '2027-01-08')).toMatchObject({ kind: 'today', workYear: 2026, workMonth: 12 });
    expect(findPaydayAlert(base, '2027-01-05')).toMatchObject({ kind: 'd3' });
    expect(findPaydayAlert(base, '2027-01-07')).toBeNull();
  });
  test('3일 전 경계가 달을 넘어도 찾는다', () => {
    const settings: PaydaySettings = { closeDay: 20, monthOffset: 1, payDay: 1, holidayRule: 'same' };
    // 2026-11-20 마감분 → 2026-12-01 지급, 3일 전은 2026-11-28
    expect(findPaydayAlert(settings, '2026-11-28')).toMatchObject({ kind: 'd3', date: '2026-12-01', workMonth: 11 });
  });
});

describe('문구', () => {
  test('시안 형식', () => {
    const d3 = findPaydayAlert(base, '2026-12-07');
    expect(d3 && paydayAlertCopy(d3)).toEqual({ title: '3일 뒤 월급날이에요', body: '12월 10일(목) · 11월 근무분' });
    const today = findPaydayAlert(base, '2026-12-10');
    expect(today && paydayAlertCopy(today)).toEqual({ title: '오늘은 월급날이에요', body: '11월 근무분을 줄 날이에요' });
  });
  test('요일 표시', () => {
    expect(formatMonthDayWeekday('2026-12-09')).toBe('12월 9일(수)');
  });
  test('줄 표시와 설명', () => {
    expect(paydayRowLabel(1, 10)).toBe('다음 달 10일');
    expect(paydayRowLabel(0, LAST)).toBe('같은 달 말일');
    expect(describePaySchedule(LAST, 1, 10)).toBe('이번 달 1일~말일 근무분을 다음 달 10일에 줘요.');
    expect(describePaySchedule(15, 1, 10)).toBe('전달 16일~이번 달 15일 근무분을 다음 달 10일에 줘요.');
  });
});

describe('같은 달 지급', () => {
  test('마감일이 말일이면 같은 달에 줄 수 없다', () => {
    expect(isSameMonthPayAllowed(LAST, 10)).toBe(false);
  });
  test('지급일이 마감일보다 뒤거나 말일이면 같은 달 가능', () => {
    expect(isSameMonthPayAllowed(15, 25)).toBe(true);
    expect(isSameMonthPayAllowed(15, LAST)).toBe(true);
    expect(isSameMonthPayAllowed(15, 15)).toBe(false);
    expect(isSameMonthPayAllowed(15, 10)).toBe(false);
  });
  test('안 되는 조합은 다음 달로 맞춘다', () => {
    expect(normalizeMonthOffset(15, 10, 0)).toBe(1);
    expect(normalizeMonthOffset(15, 25, 0)).toBe(0);
    expect(normalizeMonthOffset(15, 25, 1)).toBe(1);
  });
});

test('kstToday는 KST 날짜다', () => {
  expect(kstToday(new Date('2026-11-27T15:00:00Z'))).toBe('2026-11-28');
  expect(kstToday(new Date('2026-11-27T14:59:59Z'))).toBe('2026-11-27');
});
