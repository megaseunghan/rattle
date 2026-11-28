import {
  BANK_OPTIONS, bankShortName, daysInMonth, formatDuration, formatKoreanDate, isListedBank, joinIsoDate,
  splitDuration, splitIsoDate, weekdayOf, wheelYears,
} from '../../../lib/components/pickers';

describe('날짜 휠 도우미', () => {
  it('그달 날짜 수를 윤년까지 맞춘다', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
  it('없는 날을 고르면 그달 말일로 맞춘다', () => {
    expect(joinIsoDate(2027, 2, 31)).toBe('2027-02-28');
    expect(joinIsoDate(2026, 4, 31)).toBe('2026-04-30');
  });
  it('잘못된 날짜는 나누지 않는다', () => {
    expect(splitIsoDate('2026-02-30')).toBeNull();
    expect(splitIsoDate('2026-12-01')).toEqual({ year: 2026, month: 12, day: 1 });
  });
  it('요일을 붙여 한국어 날짜로 보여 준다', () => {
    expect(weekdayOf('2026-12-01')).toBe('화');
    expect(formatKoreanDate('2026-12-01')).toBe('2026년 12월 1일(화)');
    expect(formatKoreanDate('2026-12-01', { weekday: false })).toBe('2026년 12월 1일');
  });
  it('연도 목록은 1970년부터다', () => {
    const years = wheelYears(2027);
    expect(years[0]).toBe(1970);
    expect(years.at(-1)).toBe(2027);
    expect(years).toHaveLength(58);
  });
});

describe('주 근무시간 휠 도우미', () => {
  it('시간과 분을 읽기 쉽게 보여 준다', () => {
    expect(formatDuration(1230)).toBe('20시간 30분');
    expect(formatDuration(1200)).toBe('20시간');
    expect(formatDuration(30)).toBe('30분');
    expect(formatDuration(null)).toBe('');
  });
  it('휠 칸으로 나누고 범위를 넘으면 끝 칸에 맞춘다', () => {
    expect(splitDuration(1230)).toEqual({ hours: 20, minutes: 30 });
    expect(splitDuration(1234)).toEqual({ hours: 20, minutes: 30 });
    expect(splitDuration(100 * 60)).toEqual({ hours: 52, minutes: 50 });
  });
});

describe('은행 목록', () => {
  it('인터넷은행 → 1금융 → 2금융 순서이고 이름이 겹치지 않는다', () => {
    expect(BANK_OPTIONS.slice(0, 3).map(bank => bank.name)).toEqual(['토스뱅크', '카카오뱅크', '케이뱅크']);
    expect(BANK_OPTIONS[3].name).toBe('국민은행');
    expect(BANK_OPTIONS.at(-1)!.name).toBe('키움증권');
    expect(new Set(BANK_OPTIONS.map(bank => bank.name)).size).toBe(BANK_OPTIONS.length);
    expect(new Set(BANK_OPTIONS.map(bank => bank.short)).size).toBe(BANK_OPTIONS.length);
  });
  it('버튼엔 짧은 이름, 목록에 없는 은행은 입력한 그대로 보여 준다', () => {
    expect(bankShortName('국민은행')).toBe('국민');
    expect(bankShortName('iM뱅크(구 대구은행)')).toBe('iM뱅크');
    expect(bankShortName('어느저축은행')).toBe('어느저축은행');
    expect(isListedBank(' 신협 ')).toBe(true);
    expect(isListedBank('어느저축은행')).toBe(false);
    expect(isListedBank('')).toBe(false);
  });
});
