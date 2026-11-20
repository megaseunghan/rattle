import { parseReceipt } from '../../lib/ocr/receiptParser';
import type { RecognizedLine } from '../../modules/rattle-text-recognition';

// Synthetic amount/scope evidence; independent contract list, no device source.
const finalLabels = ['금일합계', '총결제금액', '결제금액', '실결제금액', '실결제', '청구금액', '받을금액', '총합계', '합계금액', '총계', '합계', '매출합계', '매출총계'];
const cell = (text: string, x = .05, y = .1, w = .9): RecognizedLine => ({ text, confidence: .9, box: { x, y, w, h: .02 } });
const base = () => [cell('공급가액 21,818'), cell('VAT 2,182', .05, .2), cell('매출합계 24,000', .05, .3)];
const parallel = (label: string, value: string, layout: 'inline' | 'cells', side: 'left' | 'right', gap: 'near' | 'far') => {
  if (side === 'left') {
    const x = gap === 'near' ? .26 : .5;
    return [cell('전일잔액', .05, .5, .2), ...(layout === 'inline' ? [cell(`${label} ${value}`, x, .5, .95 - x)]
      : [cell(label, x, .5, .2), cell(value, x + .22, .5, .2)])];
  }
  const end = layout === 'inline' ? .45 : .41;
  const x = gap === 'near' ? end + .01 : .7;
  return [...(layout === 'inline' ? [cell(`${label} ${value}`, .05, .5, .4)]
    : [cell(label, .05, .5, .2), cell(value, .26, .5, .15)]), cell('전일잔액', x, .5, .25)];
};
const values = [
  { name: '정상 충돌', value: '21,000', expected: null },
  { name: '미해석 오독', value: '21,OOO', expected: null },
  { name: '정상 일치 대조', value: '24,000', expected: 24000 },
];
const cases = finalLabels.flatMap(label => values.flatMap(value => (['inline', 'cells'] as const).flatMap(layout =>
  (['left', 'right'] as const).flatMap(side => (['near', 'far'] as const).map(gap => ({
    ...value, name: `${label} / ${value.name} / ${layout} / 잔액 ${side} / ${gap}`, label,
    input: parallel(label, value.value, layout, side, gap),
  }))))));

describe('R14 잔여: 병렬 빈 잔액 칸 변형표 312개', () => {
  it.each(cases)('$name', ({ input, expected, value, label }) => {
    const lines = [...base(), ...input], original = JSON.stringify(lines);
    const parsed = parseReceipt(lines);
    expect(parsed.selectedTotal?.value ?? null).toBe(expected);
    expect(parsed.suggestedTotal).toBeNull();
    if (value === '21,000') expect(parsed.totalCandidates.some(c => c.label.startsWith(label) && c.value === 21000)).toBe(true);
    if (value === '21,OOO') expect(parsed.warnings.some(w => w.includes('최종 합계'))).toBe(true);
    expect(JSON.stringify(lines)).toBe(original);
  });
});

const pastLayouts = [
  { name: '전일 접두·인라인', input: (v: string) => [cell(`전일잔액 합계 ${v}`, .05, .5)] },
  { name: '전일 별칭·한 관측', input: (v: string) => [cell(`전일잔액 / 총합계 ${v}`, .05, .5)] },
  { name: '누적 접두', input: (v: string) => [cell(`누적 총합계 ${v}`, .05, .5)] },
  { name: '전일 별칭 라벨·연결된 값 셀', input: (v: string) => [cell('전일잔액 합계', .05, .5, .4), cell(v, .75, .5, .2)] },
  { name: '별도 잔액 라벨·연결된 값 셀', input: (v: string) => [cell('전일잔액', .05, .5, .3), cell(v, .75, .5, .2)] },
  { name: '미수 접두', input: (v: string) => [cell(`미수잔액 합계 ${v}`, .05, .5)] },
];
it.each(pastLayouts.flatMap(layout => ['80,000', '80,OOO'].map(value => ({ name: `${layout.name} / ${value}`, input: layout.input(value) }))))('R14 과거 범위 대조: $name', ({ input }) => {
  const parsed = parseReceipt([...base(), ...input]);
  expect(parsed.selectedTotal?.value).toBe(24000); expect(parsed.suggestedTotal).toBeNull();
  expect(parsed.totalCandidates.every(c => c.value === 24000)).toBe(true);
});
