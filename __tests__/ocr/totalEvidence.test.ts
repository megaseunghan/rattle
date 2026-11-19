import { parseReceipt } from '../../lib/ocr/receiptParser';
import type { RecognizedLine } from '../../modules/rattle-text-recognition';

const cell = (text: string, x: number, y: number, w = .12): RecognizedLine => ({ text, confidence: .9, box: { x, y, w, h: .02 } });
const summary = (pairs: [string, string][]) => pairs.flatMap(([label, amount], i) => [cell(label, .05, .1 + i * .08, .25), cell(amount, .75, .1 + i * .08)]);
const tax: [string, string][] = [['공급가액', '20,000'], ['부가세', '2,000']];
const headers = [cell('품목명', .05, .05), cell('수량', .5, .05, .06), cell('금액', .8, .05, .1)];

// Synthetic review reproducers. R4/R5/R8 cover native lifecycle, not receipt amounts;
// their executable fixtures and expected results are indexed in the module README.
describe('OCR 검토 지적별 합계 근거 회귀표', () => {
  it.each([
    { id: 'R1', name: '단가로 회수 순액을 확정하지 않음', lines: summary([['매출총계', '30,000'], ['회수', '5,000'], ['결제금액', '30,000'], ['단가', '25,000']]), expected: null },
    { id: 'R2', name: '반품 부호 보존', lines: summary([['금일합계', '− 500']]), expected: null, suggested: -500 },
    { id: 'R3', name: '읽지 못한 배송을 0원으로 검산하지 않음', lines: summary([['상품금액', '10,000'], ['배송비', '?'], ['결제금액', '10,000']]), expected: null },
    { id: 'R6', name: '0원도 명시 금액', lines: summary([['금일합계', '0']]), expected: null, suggested: 0 },
    { id: 'R7', name: '공급가·세액은 배송 제외 상품액과 일치', lines: summary([...tax, ['상품금액', '22,000'], ['배송비', '3,000'], ['결제금액', '25,000']]), expected: 25000 },
    { id: 'R9', name: '공급가·세액에 배송 포함', lines: summary([...tax, ['상품금액', '19,000'], ['배송비', '3,000'], ['결제금액', '22,000']]), expected: 22000 },
    { id: 'R9', name: '상품 라벨 생략·배송 중복 가산 금지', lines: summary([...tax, ['배송비', '3,000'], ['결제금액', '22,000']]), expected: null },
    { id: 'R9', name: '상품 라벨 생략·배송 별도 가능성 보존', lines: summary([...tax, ['배송비', '3,000'], ['결제금액', '25,000']]), expected: null },
    { id: 'R9', name: '배송 포함 세금·상품 소계·최종 합계 병기', lines: summary([...tax, ['상품금액', '19,000'], ['총합계', '19,000'], ['배송비', '3,000'], ['결제금액', '22,000']]), expected: 22000 },
    { id: 'R9', name: '조정이 없어도 상품액과 세금 합계 충돌', lines: summary([...tax, ['상품금액', '19,000'], ['결제금액', '22,000']]), expected: null },
    { id: 'R9', name: '배송 관계 어느 쪽으로도 설명되지 않는 결제', lines: summary([...tax, ['배송비', '3,000'], ['결제금액', '30,000']]), expected: null },
    { id: 'R9', name: '할인이 이미 반영된 세금 합계', lines: summary([...tax, ['상품금액', '24,000'], ['할인', '2,000'], ['결제금액', '22,000']]), expected: 22000 },
    { id: 'R10', name: '한 관측이 수량·금액 두 열을 걸침', lines: [...headers, cell('합계', .05, .3), cell('2 500', .49, .3, .41)], expected: null },
    { id: 'R10', name: '같은 관측 안의 라벨·두 열 숫자', lines: [...headers, cell('합계 2 500', .05, .3, .85)], expected: null },
    { id: 'R10', name: '열·검산 근거 없는 공백 숫자', lines: summary([['금일합계', '38 760']]), expected: null },
    { id: 'R10', name: '금액 열 안의 공백 천단위', lines: [...headers, cell('합계', .05, .3), cell('2 500', .79, .3, .11)], expected: null },
    { id: 'R10', name: '열 없이 독립 공급가·VAT 검산', lines: summary([...tax, ['결제금액', '22 000']]), expected: 22000 },
    { id: 'R10', name: '금액 열이어도 독립 검산 충돌', lines: [...headers, ...summary([...tax, ['결제금액', '25 000']])], expected: null },
    { id: 'R10', name: '공백 공급가가 스스로 합계를 검증하지 않음', lines: summary([['공급가액', '20 000'], ['부가세', '2,000'], ['결제금액', '22 000']]), expected: null },
    { id: 'R10', name: '불명확한 공백 매출로 회수 순액을 만들지 않음', lines: summary([['매출총계', '30 000'], ['회수', '5,000'], ['총합계', '25,000']]), expected: null },
    { id: 'R10', name: '단가·현금은 공백 해석의 검산 근거가 아님', lines: summary([['단가', '2,500'], ['현금받음', '2,500'], ['금일합계', '2 500']]), expected: null },
  ])('$id: $name → $expected', ({ lines, expected, ...rest }) => {
    const original = JSON.stringify(lines);
    const parsed = parseReceipt(lines, 'synthetic-review');
    expect(parsed.selectedTotal?.value ?? null).toBe(expected);
    expect(parsed.suggestedTotal?.value ?? null).toBe('suggested' in rest ? rest.suggested : null);
    expect(JSON.stringify(lines)).toBe(original);
    if (expected === null && !('suggested' in rest)) expect(parsed.warnings.some(w => w.includes('확인하지') || w.includes('확정하지'))).toBe(true);
  });
  it.each([
    { name: '단일 결제 화면', lines: [cell('결제금액 99,000', .05, .1, .85)], selected: null, suggested: 99000 },
    { name: '수량 머리글 누락·공백 후보', lines: [headers[0], headers[2], cell('합계', .05, .3), cell('2 500', .49, .3, .41)], selected: null, suggested: null },
    { name: '상품·배송과 결제 불일치', lines: summary([['상품금액', '10,000'], ['배송비', '3,000'], ['결제금액', '20,000']]), selected: null, suggested: null },
    { name: '상품·배송과 결제 일치', lines: summary([['상품금액', '10,000'], ['배송비', '3,000'], ['결제금액', '13,000']]), selected: 13000, suggested: null },
    { name: '라벨 없이 금액 열·숫자만 있음', lines: [...headers, cell('2 500', .79, .3, .11)], selected: null, suggested: null },
    { name: '명시 합계가 둘이고 검산 없음', lines: summary([['금일합계', '10,000'], ['총합계', '10,000']]), selected: null, suggested: null },
    { name: '읽지 못한 공급가 라벨', lines: summary([['공급가액', '?'], ['결제금액', '99,000']]), selected: null, suggested: null },
    { name: '배송 포함 범위 미확인', lines: summary([...tax, ['배송비', '3,000'], ['결제금액', '22,000']]), selected: null, suggested: null },
    { name: '공급가 한쪽만 있는 불완전 검산', lines: summary([['공급가액', '20,000'], ['결제금액', '20,000']]), selected: null, suggested: null },
  ])('4회차 공통 확정 기준: $name', ({ lines, selected, suggested }) => {
    const parsed = parseReceipt(lines);
    expect(parsed.selectedTotal?.value ?? null).toBe(selected);
    expect(parsed.suggestedTotal?.value ?? null).toBe(suggested);
    if (suggested !== null) {
      expect(parsed.suggestedTotal?.parserConfidence).toBeLessThanOrEqual(.4);
      expect(parsed.suggestedTotal?.warnings).toContain('영수증 합계를 확인해주세요');
      expect(parsed.warnings).toContain('영수증 합계를 확인해주세요');
    }
  });
  it.each([
    { label: '주문금액', payment: '13,000', selected: 13000 },
    { label: '주문금액', payment: '20,000', selected: null },
  ])('명시 주문금액도 상품·배송 검산 $payment원과 일치할 때만 확정한다', ({ label, payment, selected }) => {
    const parsed = parseReceipt(summary([['상품금액', '10,000'], ['배송비', '3,000'], [label, payment]]));
    expect(parsed.selectedTotal?.value ?? null).toBe(selected);
    expect(parsed.suggestedTotal).toBeNull();
  });
  it.each([
    { label: '합계', cumulative: '90,000', selected: 10000 },
    { label: '합계', cumulative: '95,000', selected: null },
    { label: '결제금액', cumulative: '90,000', selected: null },
  ])('전일잔액·금일 검산으로 범위가 구분된 $label $cumulative원만 누적 후보로 인정한다', ({ label, cumulative, selected }) => {
    const parsed = parseReceipt(summary([['상품금액', '10,000'], ['금일합계', '10,000'], ['전일잔액', '80,000'], [label, cumulative]]));
    expect(parsed.selectedTotal?.value ?? null).toBe(selected);
    expect(parsed.suggestedTotal).toBeNull();
  });
  it.each([
    { name: '전일잔액이 있지만 금일 검산이 없음', lines: summary([['전일잔액', '80,000'], ['합계', '90,000']]) },
    { name: '읽지 못한 추가 합계', lines: summary([['상품금액', '10,000'], ['결제금액', '10,000'], ['금일합계', '?']]) },
    { name: '머리글 없는 품목 우측 숫자', lines: [cell('1. 가상 품목', .05, .1, .3), cell('99,000', .75, .1), ...summary([['결제금액', '99,000']]).map(l => ({ ...l, box: { ...l.box, y: .4 } }))] },
    { name: '공급가액 열만 있고 세금 범위 미확인', lines: [cell('품명', .05, .05), cell('공급가액', .8, .05), cell('가상 품목', .05, .2), cell('10,000', .8, .2), cell('결제금액', .05, .4), cell('10,000', .8, .4)] },
  ])('$name은 독립 검산을 확정하지 않는다', ({ lines }) => {
    const parsed = parseReceipt(lines);
    expect(parsed.selectedTotal).toBeNull();
    expect(parsed.suggestedTotal).toBeNull();
    expect(parsed.totalCandidates.length).toBeGreaterThan(0);
  });
  it('검산된 같은 금액의 라벨이 여럿이면 높은 점수의 명시 라벨을 선택한다', () => {
    const parsed = parseReceipt(summary([['상품금액', '10,000'], ['총합계', '10,000'], ['금일합계', '10,000']]));
    expect(parsed.selectedTotal?.label).toBe('금일합계');
    expect(parsed.selectedTotal?.score).toBe(120);
    expect(parsed.suggestedTotal).toBeNull();
  });
  it('검산 없는 공백 후보도 삭제하지 않고 근거·점수를 보존한다', () => {
    const parsed = parseReceipt([...headers, cell('합계', .05, .3), cell('2 500', .79, .3, .11)]);
    expect(parsed.totalCandidates).toEqual(expect.arrayContaining([expect.objectContaining({ value: 2500, source: 'derived', score: 65 })]));
    expect(parsed.selectedTotal).toBeNull();
    expect(parsed.suggestedTotal).toBeNull();
  });
  it('R9: 배송 범위가 불명확하면 파생 검산을 확정하지 않고 경고한다', () => {
    const parsed = parseReceipt(summary([...tax, ['배송비', '3,000'], ['결제금액', '22,000']]));
    expect(parsed.checks.supplyVatMatchesTotal).toBeNull();
    expect(parsed.selectedTotal).toBeNull();
    expect(parsed.suggestedTotal).toBeNull();
    expect(parsed.totalCandidates.some(c => c.value === 22000)).toBe(true);
    expect(parsed.warnings.some(w => w.includes('포함 여부'))).toBe(true);
  });
  it('R10: 독립 검산으로 읽은 공백 금액도 원문과 좌표를 보존한다', () => {
    const input = summary([...tax, ['결제금액', '22 000']]);
    const parsed = parseReceipt(input);
    expect(parsed.selectedTotal?.source).toBe('derived');
    expect(parsed.selectedTotal?.rawText).toContain('22 000');
    expect(parsed.selectedTotal?.sourceBoxes).toEqual(expect.arrayContaining(input.slice(-2).map(l => l.box)));
    expect(parsed.warnings.some(w => w.includes('공백'))).toBe(true);
  });
  it('공백 매출총계는 독립 검산 없이 파생 합계 근거로 사용하지 않는다', () => {
    const parsed = parseReceipt(summary([['매출총계', '30 000'], ['회수', '5,000'], ['총합계', '25,000']]));
    expect(parsed.totalCandidates.some(c => c.label.startsWith('매출 − 회수'))).toBe(false);
  });
  it('다른 우선순위라도 명시 결제액이 둘이면 미확정이다', () => {
    expect(parseReceipt(summary([['금일합계', '10,000'], ['결제금액', '20,000']])).selectedTotal).toBeNull();
  });
  it('같은 우선순위에 서로 다른 명시 합계가 있으면 선택하지 않는다', () => {
    expect(parseReceipt(summary([['금일합계', '10,000'], ['금일합계', '20,000']])).selectedTotal).toBeNull();
  });
});
