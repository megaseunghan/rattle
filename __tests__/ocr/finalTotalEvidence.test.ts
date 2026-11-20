import { parseReceipt } from '../../lib/ocr/receiptParser';
import type { RecognizedLine } from '../../modules/rattle-text-recognition';

// Independent synthetic contract list: no device text or identifiers.
const finalLabels = ['금일합계', '총결제금액', '결제금액', '실결제금액', '실결제', '청구금액', '받을금액', '총합계', '합계금액', '총계', '합계', '매출합계', '매출총계'];
const genericLabels = ['총합계', '합계금액', '총계', '합계'];
const cell = (text: string, x = .05, y = .1, w = .9): RecognizedLine => ({ text, confidence: .9, box: { x, y, w, h: .02 } });
const base = () => [cell('공급가액 21,818'), cell('VAT 2,182', .05, .2), cell('매출합계 24,000', .05, .3)];
const layouts = [
  { name: '인라인', input: (label: string, value: string) => [cell(`${label} ${value}`, .05, .5)] },
  { name: '별도 셀', input: (label: string, value: string) => [cell(label, .05, .5, .3), cell(value, .75, .5, .2)] },
];
const values = [
  { name: '정상 일치', value: '24,000', expected: 24000 },
  { name: '정상 불일치', value: '21,000', expected: null },
  { name: '숫자 일부 오독', value: '21,OOO', expected: null },
  { name: '전부 문자 오독', value: 'l,OOO', expected: null },
  { name: '한글 미해석', value: '이만천원', expected: null },
  { name: '낮은 신뢰도 그룹·숫자 우연 일치', value: '2,40,00', expected: null },
];

describe('R14 최종 합계 라벨 변형표 156개', () => {
  it.each(finalLabels.flatMap(label => layouts.flatMap(layout => values.map(value => ({
    ...value, name: `${label} / ${layout.name} / ${value.name}`, label, input: layout.input(label, value.value),
  })))) )('$name', ({ label, value, expected, input }) => {
    const lines = [...base(), ...input], original = JSON.stringify(lines);
    const parsed = parseReceipt(lines);
    expect(parsed.selectedTotal?.value ?? null).toBe(expected);
    expect(parsed.suggestedTotal).toBeNull();
    if (value === '24,000' || value === '21,000') expect(parsed.totalCandidates.some(c => c.label.startsWith(label) && c.value === Number(value.replace(',', '')))).toBe(true);
    else expect(parsed.warnings.some(w => w.includes('최종 합계'))).toBe(true);
    expect(JSON.stringify(lines)).toBe(original);
  });
});

it.each(finalLabels)('R14: 머리글 %s는 미해석 최종 합계로 세지 않는다', label => {
  const parsed = parseReceipt([cell('공급가액', .05, .05, .2), cell('부가세', .5, .05, .15), cell(label, .75, .05, .2), ...base()]);
  expect(parsed.selectedTotal?.value).toBe(24000); expect(parsed.suggestedTotal).toBeNull();
});

it.each(finalLabels.flatMap(label => [
  { name: `${label} 인라인`, input: [cell(`${label} 21,OOO`, .5, .05, .45)] },
  { name: `${label} 별도 셀`, input: [cell(label, .5, .05, .2), cell('21,OOO', .8, .05, .15)] },
]))('R14: 머리글 모양이어도 값이 있는 미해석 $name는 차단한다', ({ input }) => {
  const parsed = parseReceipt([cell('공급가액', .05, .05, .15), cell('부가세', .3, .05, .15), ...input, ...base()]);
  expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
  expect(parsed.warnings.some(w => w.includes('최종 합계'))).toBe(true);
});

it.each(genericLabels.flatMap(label => layouts.map(layout => ({ label, layout }))))('R14: 독립 누적 관계로 검증한 $label만 경쟁에서 제외한다', ({ label, layout }) => {
  const parsed = parseReceipt([...base(), cell('금일합계 24,000', .05, .35), cell('전일잔액 80,000', .05, .4), ...layout.input(label, '104,000')]);
  expect(parsed.selectedTotal?.value).toBe(24000); expect(parsed.suggestedTotal).toBeNull();
  expect(parsed.totalCandidates.some(c => c.value === 104000)).toBe(true);
});

it.each(genericLabels.flatMap(label => layouts.map(layout => ({ label, layout }))))('R14: 읽지 못한 $label를 누적 관계로 추정해 면제하지 않는다', ({ label, layout }) => {
  const parsed = parseReceipt([...base(), cell('금일합계 24,000', .05, .35), cell('전일잔액 80,000', .05, .4), ...layout.input(label, '104,OOO')]);
  expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
});

it.each(finalLabels)('R14: 앞의 잔액 값이 같은 관측의 미해석 %s를 숨기지 않는다', label => {
  const parsed = parseReceipt([...base(), cell(`전일잔액 80,000 / ${label} 21,OOO`, .05, .5)]);
  expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
});

it.each(finalLabels)('R14: 미해석 %s가 다른 라벨의 0을 빌리지 않는다', label => {
  const parsed = parseReceipt([...base(), cell(`${label} l,OOO / 보증금 0`, .05, .5)]);
  expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
});

it.each(finalLabels)('R14: 같은 행의 연락처 라벨이 미해석 %s를 숨기지 않는다', label => {
  const parsed = parseReceipt([...base(), cell('전화', .05, .5, .1), cell(label, .3, .5, .25), cell('21,OOO', .75, .5, .2)]);
  expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
});

it('R14: 다른 라벨의 미해석 내용에 있는 누계 단어를 최종 합계의 범위로 빌리지 않는다', () => {
  const parsed = parseReceipt([...base(), cell('주문금액 누계 / 총합계 21,OOO', .05, .5)]);
  expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
});

it('R14: 같은 행의 설명 속 누계 단어를 최종 합계의 범위로 빌리지 않는다', () => {
  const parsed = parseReceipt([...base(), cell('가상 설명 누계', .05, .5, .2), cell('총합계', .4, .5, .2), cell('21,OOO', .75, .5, .2)]);
  expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
});

it.each([
  { name: '열 머리글과 정상 복수 금액', header: true, vat: '2,182', expected: 24000 },
  { name: '열 머리글이 있어도 실제 오독 값', header: true, vat: '2,l82', expected: null },
  { name: '열 근거 없는 복수 금액', header: false, vat: '2,182', expected: null },
  { name: '열 머리글이 있어도 세금 내역과 다른 집계', header: true, vat: '2,182', gross: '25,000', expected: null },
])('R14: 표의 합계 행 구분 · $name', ({ header, vat, expected, ...rest }) => {
  const parsed = parseReceipt([
    ...(header ? [cell('공급가액', .1, .01, .2), cell('부가세', .4, .01, .15), cell('보증금', .7, .01, .15)] : []),
    ...base(), cell('합계', .05, .5, .2), cell('21,818', .35, .5, .15), cell(vat, .55, .5, .15), cell(('gross' in rest ? rest.gross : undefined) ?? '24,000', .75, .5, .2),
  ]);
  expect(parsed.selectedTotal?.value ?? null).toBe(expected); expect(parsed.suggestedTotal).toBeNull();
});

it.each([
  { name: '수량 열 오독·정상 금액 열', value: '24,000', label: '합계', expected: 24000 },
  { name: '수량 열과 금액 열 모두 오독', value: '24,OOO', label: '합계', expected: null },
  { name: '수량 열 오독·충돌 금액 열', value: '21,000', label: '합계', expected: null },
  { name: '인라인 미해석 값을 열 근거로 면제하지 않음', value: '24,000', label: '합계 21,OOO', expected: null },
])('R14: 수량·합계 열 경계 · $name', ({ value, label, expected }) => {
  const parsed = parseReceipt([cell('수량', .5, .01, .1), cell('매출합계', .8, .01, .15), ...base(),
    cell(label, .05, .5, .3), cell('3/', .5, .5, .05), cell('(', .6, .5, .03), cell(value, .8, .5, .15)]);
  expect(parsed.selectedTotal?.value ?? null).toBe(expected); expect(parsed.suggestedTotal).toBeNull();
});
