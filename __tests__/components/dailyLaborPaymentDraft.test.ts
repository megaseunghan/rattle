import {
  createPaymentDraft, draftErrors, hasEdits, isEdited, netOf, resetDeduction, resolvePaidOn, setDeduction, toPaymentGroups, totalNet,
} from '../../lib/components/daily-labor/paymentDraft';
import { amountText, calendarCells, dayLabel, monthLabel, parseAmount, shiftMonth } from '../../lib/components/daily-labor/format';
import type { DailyLaborEntry } from '../../types';

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

const entry = (id: string, laborerId: string, gross: number, extra: Partial<DailyLaborEntry> = {}) => ({
  id, laborer_id: laborerId, payment_id: null, gross, day_income_tax: 999, employment_insurance: (gross * 9) / 1000, calculation_version: '2026-v2', ...extra,
}) as DailyLaborEntry;

const entries = [entry('a1', 'a', 150_000), entry('b1', 'b', 200_000), entry('a2', 'a', 170_000), entry('a3', 'a', 150_000, { payment_id: 'p' })];

describe('지급 완료로 바꾸기 시트 입력', () => {
  it('고른 지급 대기 기록만 사람별로 묶고 예상 공제를 채운다', () => {
    const groups = createPaymentDraft(entries, new Set(['a1', 'a2', 'b1', 'a3']));
    expect(groups.map(g => [g.laborerId, g.entries.map(e => e.id)])).toEqual([['a', ['a1', 'a2']], ['b', ['b1']]]);
    expect(groups[0].gross).toBe(320_000);
    expect(groups[0].actual).toEqual(groups[0].estimate);
    // 하루 산출세액 999원 × 2 = 1,998원 → 10원 버림 1,990원, 지방소득세 190원(묶음 합계 기준)
    expect(groups[0].estimate).toEqual({ income_tax: 1_990, local_income_tax: 190, employment_insurance: 1_350 + 1_530 });
    // 999원 한 건은 1,000원 미만이라 떼지 않는다
    expect(groups[1].estimate.income_tax).toBe(0);
  });

  it('고친 칸은 고침으로 보이고 되돌리면 예상값으로 돌아간다(원본은 바뀌지 않는다)', () => {
    const groups = createPaymentDraft(entries, new Set(['a1', 'a2']));
    const edited = setDeduction(groups, 'a', 'income_tax', 0);
    expect(isEdited(edited[0], 'income_tax')).toBe(true);
    expect(isEdited(edited[0], 'employment_insurance')).toBe(false);
    expect(hasEdits(edited)).toBe(true);
    expect(groups[0].actual.income_tax).toBe(1_990);
    const reset = resetDeduction(edited, 'a', 'income_tax');
    expect(reset[0].actual.income_tax).toBe(1_990);
    expect(hasEdits(reset)).toBe(false);
  });

  it('실수령은 세전에서 실제 공제를 빼고, 합계는 사람별 실수령의 합이다', () => {
    const groups = setDeduction(createPaymentDraft(entries, new Set(['a1', 'b1'])), 'b', 'employment_insurance', 0);
    expect(netOf(groups[1])).toBe(200_000);
    expect(totalNet(groups)).toBe(netOf(groups[0]) + 200_000);
  });

  it('공제 합계가 세전을 넘는 사람만 오류로 표시한다', () => {
    const groups = setDeduction(createPaymentDraft(entries, new Set(['a1', 'b1'])), 'b', 'income_tax', 200_001);
    expect(draftErrors(groups)).toEqual({ b: expect.stringContaining('세전 금액보다') });
  });

  it('서비스로 보낼 때는 고친 값을 그대로 보낸다', () => {
    const groups = setDeduction(createPaymentDraft(entries, new Set(['a1'])), 'a', 'local_income_tax', 0);
    expect(toPaymentGroups(groups)).toEqual([{ laborerId: 'a', entries: [entries[0]], deductions: { ...groups[0].estimate, local_income_tax: 0 } }]);
  });

  it('지급일: 오늘·어제·다른 날(오늘 이후나 고르지 않으면 없음)', () => {
    expect(resolvePaidOn('today', null, '2026-11-01')).toBe('2026-11-01');
    expect(resolvePaidOn('yesterday', null, '2026-11-01')).toBe('2026-10-31');
    expect(resolvePaidOn('pick', null, '2026-11-28')).toBeNull();
    expect(resolvePaidOn('pick', '2026-11-29', '2026-11-28')).toBeNull();
    expect(resolvePaidOn('pick', '2026-10-15', '2026-11-28')).toBe('2026-10-15');
  });
});

describe('급여대장 표시 변환', () => {
  it('날짜·달 이름과 달 넘기기', () => {
    expect(dayLabel('2026-11-08')).toBe('11월 8일(일)');
    expect(monthLabel('2026-01')).toBe('2026년 1월');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
  it('금액 입력은 숫자만 남기고 쉼표로 보여 준다', () => {
    expect(parseAmount('1,500원')).toBe(1_500);
    expect(parseAmount('')).toBeNull();
    expect(amountText(150_000)).toBe('150,000');
    expect(amountText(null)).toBe('');
  });
  it('달력은 첫 주 앞을 빈칸으로 채운다(2026년 11월 1일은 일요일)', () => {
    const cells = calendarCells('2026-11');
    expect(cells[0]).toBe('2026-11-01');
    expect(cells).toHaveLength(30);
    expect(calendarCells('2026-12')[0]).toBeNull();
  });
});
