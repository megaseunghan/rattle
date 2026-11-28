import {
  calendarCells, clampProbationEnd, defaultProbationEnd, initialProbationDraft, isStoreDefaultRate, parseRatePercent,
  probationBelowFloor, probationExample, probationFloorNotice, probationQuickEnd, probationSpanDays, ratePercentOf, shiftMonth,
} from '../../../lib/components/join/probationValues';

describe('수습 마지막 날 빠른 칩(달력 개월, 90일 아님)', () => {
  it.each([
    ['2026-06-01', 3, '2026-08-31'],
    ['2026-12-01', 3, '2027-02-28'],
    ['2027-01-31', 1, '2027-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2026-03-15', 1, '2026-04-14'],
  ] as const)('%s + %i개월 → %s', (joinedAt, months, expected) => {
    expect(probationQuickEnd(joinedAt, months)).toBe(expected);
  });
  it('첫 값은 매장 기본 기간, 매장 기본이 없으면 3개월 끝', () => {
    expect(defaultProbationEnd('2026-12-01', 2)).toBe('2027-01-31');
    expect(defaultProbationEnd('2026-12-01', null)).toBe('2027-02-28');
  });
  it('입사일 ~ 3개월 끝 밖의 날짜는 범위 안으로 맞춘다', () => {
    expect(clampProbationEnd('2027-05-01', '2026-12-01')).toBe('2027-02-28');
    expect(clampProbationEnd('2026-11-01', '2026-12-01')).toBe('2026-12-01');
    expect(clampProbationEnd('잘못', '2026-12-01')).toBe('2027-02-28');
    expect(clampProbationEnd('2027-01-10', '2026-12-01')).toBe('2027-01-10');
  });
  it('일수는 양 끝을 포함해 센다', () => {
    expect(probationSpanDays('2026-12-01', '2027-02-28')).toBe(90);
    expect(probationSpanDays('2026-06-01', '2026-08-31')).toBe(92);
  });
});

describe('수습 중 급여 %', () => {
  it('비율과 % 문자열을 서로 바꾼다', () => {
    expect(ratePercentOf(0.9)).toBe('90');
    expect(ratePercentOf(0.955)).toBe('95.5');
    expect(ratePercentOf(null)).toBe('90');
    expect(parseRatePercent('90')).toBe(0.9);
    expect(parseRatePercent('100')).toBe(1);
    expect(parseRatePercent('0')).toBeNull();
    expect(parseRatePercent('101')).toBeNull();
    expect(parseRatePercent('9a')).toBeNull();
  });
  it('매장 기본값과 같으면 매장 기본값으로 본다', () => {
    expect(isStoreDefaultRate('90', 0.9)).toBe(true);
    expect(isStoreDefaultRate('90', null)).toBe(true);
    expect(isStoreDefaultRate('95', 0.9)).toBe(false);
  });
  it('시트 첫 값: 수습이 아니면 매장 기본 비율·기간으로 채운다', () => {
    expect(initialProbationDraft({ isProbation: false, endsOn: null, rate: 0.8, joinedAt: '2026-12-01', storeMonths: 1, storeRate: 0.95 }))
      .toEqual({ isProbation: false, endsOn: '2026-12-31', ratePercent: '95' });
    expect(initialProbationDraft({ isProbation: true, endsOn: '2027-01-15', rate: 0.8, joinedAt: '2026-12-01', storeMonths: 1, storeRate: 0.95 }))
      .toEqual({ isProbation: true, endsOn: '2027-01-15', ratePercent: '80' });
  });
});

describe('최저임금 90% 안내', () => {
  const part = { isPart: true, hourlyWage: 10_320, monthlySalary: null, weeklyMinutes: 1200, weeklyRestIncluded: false };
  it('수습 비율을 적용한 시급이 최저임금 90%보다 적으면 알린다', () => {
    expect(probationBelowFloor(part, 0.9, '2026-12-01')).toBe(false);
    expect(probationBelowFloor(part, 0.8, '2026-12-01')).toBe(true);
  });
  it('안내 문구에 수습 중 금액과 90% 금액을 적는다(주휴 포함·월급은 금액 없이)', () => {
    expect(probationFloorNotice(part, 0.9, '2026-12-01')).toBeNull();
    expect(probationFloorNotice(part, 0.8, '2026-12-01'))
      .toBe('수습 중 시급 8,256원은 최저임금의 90%(9,288원)보다 적어요. 수습이어도 이보다 적게 주면 위험해요. 그래도 저장할 수 있어요.');
    expect(probationFloorNotice({ ...part, weeklyRestIncluded: true }, 0.8, '2026-12-01'))
      .toBe('수습 중 시급 8,256원은 최저임금의 90%보다 적어요. 수습이어도 이보다 적게 주면 위험해요. 그래도 저장할 수 있어요.');
    expect(probationFloorNotice({ isPart: false, hourlyWage: null, monthlySalary: 2_000_000, weeklyMinutes: 2400, weeklyRestIncluded: null }, 0.8, '2026-12-01'))
      .toBe('수습 중 월 기본급 1,600,000원은 최저임금의 90%보다 적어요. 수습이어도 이보다 적게 주면 위험해요. 그래도 저장할 수 있어요.');
  });
  it('예시 금액을 보여 준다', () => {
    expect(probationExample({ ...part, hourlyWage: 10_000 }, 0.9)).toBe('시급 10,000원이면 수습 중 9,000원이에요.');
    expect(probationExample({ isPart: false, hourlyWage: null, monthlySalary: 2_800_000, weeklyMinutes: null, weeklyRestIncluded: null }, 0.9))
      .toBe('월 기본급 2,800,000원이면 수습 중 2,520,000원이에요.');
    expect(probationExample({ ...part, hourlyWage: null }, 0.9)).toBeNull();
  });
});

describe('수습 달력', () => {
  it('앞쪽 빈칸과 그달 날짜를 만든다', () => {
    const cells = calendarCells(2027, 2);
    expect(cells.leading).toBe(1);
    expect(cells.dates).toHaveLength(28);
    expect(cells.dates[0]).toBe('2027-02-01');
  });
  it('해를 넘겨 달을 옮긴다', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2027, 1, -1)).toEqual({ year: 2026, month: 12 });
  });
});
