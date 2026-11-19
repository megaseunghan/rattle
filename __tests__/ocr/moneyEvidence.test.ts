import { parseReceipt } from '../../lib/ocr/receiptParser';
import type { RecognizedLine } from '../../modules/rattle-text-recognition';

const cell = (text: string, x = .05, y = .1, w = .9): RecognizedLine => ({ text, confidence: .9, box: { x, y, w, h: .02 } });

describe('OCR-R11: 실제 소비한 금액 토큰의 독립성', () => {
  it.each([
    { name: '한 관측의 상품·결제 라벨이 숫자 하나를 공유', input: [cell('상품금액/결제금액 10,000')], expected: null },
    { name: '별도 라벨 관측이 금액 관측 하나를 공유', input: [cell('상품금액 / 결제금액', .05, .1, .5), cell('10,000', .75, .1, .15)], expected: null },
    { name: '별도 행의 상품액과 결제액', input: [cell('상품금액 10,000'), cell('결제금액 10,000', .05, .3)], expected: 10000 },
    { name: '같은 행의 별도 금액 관측 두 개', input: [cell('상품금액', .05, .1, .2), cell('10,000', .3, .1, .15), cell('결제금액', .5, .1, .2), cell('10,000', .75, .1, .15)], expected: 10000 },
    { name: '같은 원본 관측 안의 독립 숫자 두 개', input: [cell('상품금액 10,000 / 결제금액 10,000')], expected: 10000 },
    { name: '공급가·VAT 피연산자도 같은 토큰 재사용 금지', input: [cell('공급가액/VAT 5,000'), cell('결제금액 10,000', .05, .3)], expected: null },
    { name: '배송·할인이 같은 금액 토큰을 공유', input: [cell('상품금액 10,000'), cell('배송비/할인 5,000', .05, .3), cell('결제금액 10,000', .05, .5)], expected: null },
    { name: '한 관측의 충돌하는 두 결제 라벨 보존', input: [cell('금일합계 10,000 / 결제금액 20,000')], expected: null },
    { name: '한 관측의 반복 합계 라벨만으로 제안하지 않음', input: [cell('합계 10,000 / 합계 10,000')], expected: null },
    { name: '한 관측의 서로 다른 상품액이 있으면 미확정', input: [cell('상품금액 10,000 / 상품금액 20,000 / 결제금액 10,000')], expected: null },
    { name: '0원 상품과 배송·결제 공유 금액', input: [cell('상품금액 0'), cell('배송비/결제금액 3,000', .05, .3)], expected: null },
    { name: '같은 관측의 독립 공급가·VAT·합계 토큰', input: [cell('공급가액 20,000 / VAT 2,000 / 결제금액 22,000')], expected: 22000 },
  ])('$name → $expected', ({ input, expected }) => {
    const before = JSON.stringify(input);
    const parsed = parseReceipt(input, 'synthetic-r11');
    expect(parsed.selectedTotal?.value ?? null).toBe(expected);
    expect(parsed.suggestedTotal).toBeNull();
    expect(parsed.totalCandidates.length).toBeGreaterThan(0);
    expect(JSON.stringify(input)).toBe(before);
    if (expected === null) {
      expect(parsed.checks.goodsAdjustmentsMatchTotal).toBeNull();
      expect(parsed.checks.supplyVatMatchesTotal).toBeNull();
      expect(parsed.warnings.some(w => w.includes('독립') || w.includes('공유') || w.includes('여러 개') || w.includes('불완전') || w.includes('확인하지'))).toBe(true);
    }
  });
});

it('R11: 공유 금액 필드와 후보에 같은 원문 토큰 ID·위치를 남긴다', () => {
  const input = [cell('상품금액 / 결제금액 10,000')];
  const parsed = parseReceipt(input, 'synthetic-r11');
  expect(parsed.amounts.goods?.moneyTokens).toEqual(parsed.totalCandidates[0].moneyTokens);
  const token = parsed.totalCandidates[0].moneyTokens![0];
  expect(token.observationId).toBe(0);
  expect(input[token.observationId].text.slice(token.start, token.end)).toBe('10,000');
  expect(parsed.selectedTotal).toBeNull();
  expect(parsed.suggestedTotal).toBeNull();
});
it.each(['상품금액 10,000 / 결제금액 10,000', '🧾 상품금액 １０，０００ / 결제금액 １０，０００'])('R11: 같은 관측의 서로 다른 토큰 위치를 보존한다: %s', text => {
  const input = [cell(text)];
  const parsed = parseReceipt(input);
  const goods = parsed.amounts.goods!.moneyTokens![0];
  const payment = parsed.totalCandidates.find(c => c.label === '결제금액')!.moneyTokens![0];
  expect(goods.observationId).toBe(0);
  expect(payment.observationId).toBe(0);
  expect(goods.end).toBeLessThanOrEqual(payment.start);
  expect(text.slice(goods.start, goods.end)).toBe(text.slice(payment.start, payment.end));
  expect(parsed.selectedTotal?.value).toBe(10000);
});
it('R11: 별도 관측의 같은 숫자는 다른 ID를 갖는다', () => {
  const parsed = parseReceipt([cell('상품금액 10,000'), cell('결제금액 10,000', .05, .3)]);
  expect(parsed.amounts.goods?.moneyTokens?.[0].observationId).toBe(0);
  expect(parsed.totalCandidates.find(c => c.label.includes('결제금액'))?.moneyTokens?.[0].observationId).toBe(1);
  expect(parsed.selectedTotal?.value).toBe(10000);
});
it('R11: 공유 후보가 앞에 있어도 별도 토큰의 정상 후보·검산을 막지 않는다', () => {
  const parsed = parseReceipt([cell('상품금액/금일합계 10,000'), cell('결제금액 10,000', .05, .3)]);
  expect(parsed.selectedTotal?.value).toBe(10000);
  expect(parsed.selectedTotal?.moneyTokens?.[0].observationId).toBe(1);
  expect(parsed.suggestedTotal).toBeNull();
});
it.each([
  { name: '상품액과 잔액이 같은 토큰', rows: [cell('상품금액/전일잔액 10,000')], expected: null },
  { name: '상품액과 잔액이 별도 토큰', rows: [cell('상품금액 10,000'), cell('전일잔액 10,000', .05, .2)], expected: 10000 },
])('R11: 누적 합계 범위의 피연산자도 독립성을 확인한다: $name', ({ rows, expected }) => {
  const parsed = parseReceipt([...rows, cell('결제금액 10,000', .05, .4), cell('합계 20,000', .05, .6)]);
  expect(parsed.selectedTotal?.value ?? null).toBe(expected);
  expect(parsed.suggestedTotal).toBeNull();
});
it('R11: 복합 라벨 구분자 처리가 단독 금액 뒤의 미완성 식을 숨기지 않는다', () => {
  const parsed = parseReceipt([cell('결제금액 10,000 /')]);
  expect(parsed.selectedTotal).toBeNull();
  expect(parsed.suggestedTotal).toBeNull();
});

describe('OCR-R12: 계산 피연산자와 보조 일치 제약 분리', () => {
  it.each([
    { name: '공급가·VAT는 독립이고 상품·결제만 공유', input: [cell('공급가액 20,000'), cell('VAT 2,000', .05, .3), cell('상품금액/결제금액 22,000', .05, .5)], expected: 22000 },
    { name: '동일 관측의 공유 별칭 연결 누락은 안전한 미확정 backlog', input: [cell('공급가액 20,000 / VAT 2,000 / 상품금액/결제금액 22,000')], expected: null },
    { name: '공급가·VAT는 같은 관측의 독립 숫자이고 상품·결제는 공유', input: [cell('공급가액 20,000 / VAT 2,000'), cell('상품금액/결제금액 22,000', .05, .3)], expected: 22000 },
    { name: '상품·결제 라벨 관측과 숫자 관측이 분리돼도 세금 검산 유지', input: [cell('공급가액 20,000'), cell('VAT 2,000', .05, .3), cell('상품금액/결제금액', .05, .5, .5), cell('22,000', .75, .5, .15)], expected: 22000 },
    { name: '보조 상품액이 계산과 다름', input: [cell('공급가액 20,000'), cell('VAT 2,000', .05, .3), cell('상품금액/결제금액 23,000', .05, .5)], expected: null },
    { name: '실제 공급가·VAT가 같은 토큰이면 계속 차단', input: [cell('공급가액/VAT 11,000'), cell('상품금액/결제금액 22,000', .05, .3)], expected: null },
    { name: '독립 공급가·VAT 없이 상품·결제만 공유', input: [cell('상품금액/결제금액 22,000')], expected: null },
  ])('$name → $expected', ({ input, expected }) => {
    const parsed = parseReceipt(input, 'synthetic-r12');
    expect(parsed.selectedTotal?.value ?? null).toBe(expected);
    expect(parsed.suggestedTotal).toBeNull();
    if (expected !== null) {
      expect(parsed.checks.supplyVatMatchesTotal).toBe(true);
      const printed = parsed.totalCandidates.find(c => c.source === 'observed' && c.value === expected)!;
      expect(parsed.amounts.goods?.moneyTokens).toEqual(printed.moneyTokens);
      const derived = parsed.totalCandidates.find(c => c.source === 'derived' && c.value === expected)!;
      // The shared auxiliary goods value is not counted again as an operand.
      const identities = derived.moneyTokens!.map(t => `${t.observationId}:${t.start}:${t.end}`);
      expect(identities).toHaveLength(3);
      expect(new Set(identities).size).toBe(3);
    } else {
      expect(parsed.checks.supplyVatMatchesTotal).toBeNull();
    }
  });
});
