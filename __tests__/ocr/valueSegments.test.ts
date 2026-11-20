import { parseReceipt } from '../../lib/ocr/receiptParser';
import type { RecognizedLine } from '../../modules/rattle-text-recognition';

// Synthetic labels, amounts and geometry only.
const cell = (text: string, x = .05, y = .5, w = .9): RecognizedLine => ({ text, confidence: .9, box: { x, y, w, h: .02 } });
const base = () => [cell('공급가액 21,818', .05, .1), cell('VAT 2,182', .05, .2), cell('매출합계 24,000', .05, .3)];
const layouts: { name: string; input: (value: string, adjustment: string) => RecognizedLine[] }[] = [
  { name: '인라인·별도 행', input: (v, a) => [...base(), cell(`회수 ${v}`), cell(`${a} 0`, .05, .6)] },
  { name: '한 행의 별도 셀', input: (v, a) => [...base(), cell('회수', .05, .5, .15), cell(v, .25, .5, .15), cell(a, .5, .5, .15), cell('0', .8, .5, .1)] },
  { name: '후행 단일 숫자 복합 관측', input: (v, a) => [...base(), cell(`회수 ${v} / ${a} 0`)] },
  { name: '모든 라벨이 한 관측', input: (v, a) => [cell(`공급가액 21,818 / VAT 2,182 / 매출합계 24,000 / 회수 ${v} / ${a} 0`)] },
  { name: '빈 회수 별칭이 앞', input: (v, a) => [...base(), cell(`회수 / 회수 ${v} / ${a} 0`)] },
  { name: '빈 회수 별칭이 뒤', input: (v, a) => [...base(), cell(`회수 ${v} / 회수 / ${a} 0`)] },
  { name: '복합 라벨·별도 금액 셀', input: (v, a) => [...base(), cell(`회수 ${v} / ${a}`, .05, .5, .6), cell('0', .8, .5, .1)] },
  { name: '0원 라벨이 앞', input: (v, a) => [...base(), cell(`${a} 0 / 회수 ${v}`)] },
  { name: '배송비·보증금 모두 0', input: (v, a) => [...base(), cell(`회수 ${v} / ${a} 0 / ${a === '보증금' ? '배송비' : '보증금'} 0`)] },
];
const cases = layouts.flatMap(layout => ['보증금', '배송비'].flatMap(adjustment => ['삼천원', 'l,OOO', '3,O00'].map(value => ({
  name: `${layout.name} / ${adjustment} / ${value}`, input: layout.input(value, adjustment),
}))));

describe('R13 구조 회귀: 값 구간 분류 변형표 54개', () => {
  it.each(cases)('$name', ({ input }) => {
    const original = JSON.stringify(input);
    const parsed = parseReceipt(input);
    expect(parsed.amountStatus.returns).toBe('unreadable');
    expect(parsed.selectedTotal).toBeNull();
    expect(parsed.suggestedTotal).toBeNull();
    expect(parsed.totalCandidates.some(candidate => candidate.value === 24000)).toBe(true);
    expect(JSON.stringify(input)).toBe(original);
  });
});

it.each(['회수', '보증금', '배송비', '할인', '상품금액', '공급가액', 'VAT'])('R13: %s의 unparsed 구간은 0원 관측이 있어도 면제하지 않는다', label => {
  const parsed = parseReceipt([...base(), cell(`${label} 삼천원 / 보증금 0`)]);
  expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
});

it.each(['보증금', '배송비'])('R13 대조: 실제 빈 회수 별칭만 %s의 후행 0을 공유한다', adjustment => {
  const parsed = parseReceipt([...base(), cell(`회수 / ${adjustment} 0`)]);
  expect(parsed.amountStatus.returns).toBe('observed');
  expect(parsed.amounts.returns?.value).toBe(0);
  expect(parsed.amounts.returns?.moneyTokens).toEqual(adjustment === '보증금' ? parsed.amounts.deposit?.moneyTokens : parsed.amounts.shipping?.moneyTokens);
  expect(parsed.selectedTotal?.value).toBe(24000); expect(parsed.suggestedTotal).toBeNull();
});

it.each(['회수', '회수액'])('R13 대조: 내용 없는 %s는 빈 부가란이다', label => {
  const parsed = parseReceipt([...base(), cell(label)]);
  expect(parsed.selectedTotal?.value).toBe(24000); expect(parsed.suggestedTotal).toBeNull();
});
