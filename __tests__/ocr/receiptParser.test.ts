import { extractMoney, parseReceipt } from '../../lib/ocr/receiptParser';
import type { RecognizedLine } from '../../modules/rattle-text-recognition';

// Synthetic text and coordinates only. No photographed receipts or business identifiers.
const line = (text: string, x = .1, y = .1, w = .2, h = .02): RecognizedLine => ({ text, confidence: .9, box: { x, y, w, h } });
const row = (label: string, value: string, y: number) => [line(label, .1, y), line(value, .75, y, .15)];
const table = () => [
  line('품목명', .1, .2), line('수량', .5, .2, .06), line('단가', .65, .2, .08), line('금액', .8, .2, .1),
  line('가상 사과', .1, .3), line('2.5', .5, .3, .06), line('2,000', .65, .3, .08), line('5,000', .8, .3, .1),
];

describe('영수증 규칙 파서', () => {
  it('천단위 점·쉼표를 정규화하고 소수 수량과 날짜를 금액으로 오인하지 않는다', () => {
    expect(extractMoney('12.300 / 24, 600 / 0원 / -1,000')).toEqual([12300, 24600, 0, -1000]);
    expect(extractMoney('2.28 / 2026-11-19')).toEqual([]);
  });
  it('같은 높이 셀을 묶고 금일합계를 우선하며 전일·미수잔액을 제외한다', () => {
    const parsed = parseReceipt([...row('총합계', '99,000', .1), ...row('금일합계', '15.000', .3), ...row('전일잔액 합계', '600,000', .5), ...row('미수잔액', '800,000', .7)], 'synthetic');
    expect(parsed.selectedTotal?.value).toBe(15000);
    expect(parsed.totalCandidates.map(c => c.value)).toEqual([15000, 99000]);
    expect(parsed.amounts.balance?.value).toBe(600000);
    expect(parsed.selectedTotal?.sourceImageId).toBe('synthetic');
  });
  it('합계 라벨 아래 다른 행의 미수금 숫자를 연결하지 않는다', () => {
    const parsed = parseReceipt([line('총계', .1, .2), ...row('미수잔액', '900,000', .23)]);
    expect(parsed.selectedTotal).toBeNull();
  });
  it('공급가와 VAT를 더한 숫자가 인쇄돼 있을 때만 합계 후보로 만든다', () => {
    const input = [...row('공급가액', '20,000', .2), ...row('부가세', '2,000', .3), ...row('총합계', '22,000', .4)];
    const result = parseReceipt(input);
    expect(result.selectedTotal?.value).toBe(22000);
    expect(result.selectedTotal?.source).toBe('derived');
    expect(result.checks.supplyVatMatchesTotal).toBe(true);
    expect(parseReceipt(input.slice(0, -2)).selectedTotal).toBeNull();
  });
  it('보증금과 회수를 분리하고 인쇄된 순액을 확인해도 회계 정책 경고를 유지한다', () => {
    const result = parseReceipt([...row('매출총계', '30,000', .1), ...row('보증금', '2,000', .2), ...row('회수', '5,000', .3), ...row('결제금액', '25,000', .4)]);
    expect(result.amounts.deposit?.value).toBe(2000);
    expect(result.amounts.returns?.value).toBe(5000);
    expect(result.selectedTotal?.value).toBe(25000);
    expect(result.warnings.some(w => w.includes('반영 기준'))).toBe(true);
  });
  it('유효 날짜와 상호 후보만 보관하고 현재 날짜를 채우지 않는다', () => {
    const result = parseReceipt([line('상호: 가상식품'), line('2026.02.30 2026.11.19', .1, .2)]);
    expect(result.vendorCandidates.map(v => v.value)).toContain('가상식품');
    expect(result.dateCandidates.map(d => d.value)).toEqual(['2026-11-19']);
    expect(parseReceipt([]).dateCandidates).toEqual([]);
  });
  it('소수 수량·단가·금액을 보존하고 반올림 검산한다', () => {
    const result = parseReceipt([...table(), ...row('금일합계', '5,000', .5)]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity?.value).toBe(2.5);
    expect(result.items[0].unitPrice?.value).toBe(2000);
    expect(result.items[0].amount?.value).toBe(5000);
    expect(result.items[0].arithmeticMatches).toBe(true);
    expect(result.checks.itemsMatchTotal).toBe(true);
  });
  it('인쇄 금액 불일치를 자동 정정하지 않는다', () => {
    const input = table(); input[input.length - 1].text = '5,200';
    const result = parseReceipt([...input, ...row('금일합계', '5,200', .5)]);
    expect(result.items[0].amount?.value).toBe(5200);
    expect(result.items[0].arithmeticMatches).toBe(false);
    expect(result.items[0].amount?.warnings).not.toHaveLength(0);
  });
  it('빈 자료·신뢰도 미제공·누락 금액을 0으로 확정하지 않는다', () => {
    const empty = parseReceipt([]);
    expect(empty.selectedTotal).toBeNull(); expect(empty.checks.itemSum).toBeNull();
    const result = parseReceipt([{ ...line('금일합계 4,000'), confidence: null }]);
    expect(result.selectedTotal?.ocrConfidence).toBeNull();
    expect(result.selectedTotal?.value).toBe(4000);
  });
  it('회전 보정은 복사본에서 수행해 원문 좌표를 보존한다', () => {
    const input = [line('금일합계 7,000', .2, .1, .02, .5)];
    const snapshot = JSON.stringify(input);
    const result = parseReceipt(input);
    expect(result.rotated).toBe(true);
    expect(result.selectedTotal?.sourceBoxes).toEqual([input[0].box]);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
  it('동일 우선순위의 복수 합계는 경고한다', () => {
    const result = parseReceipt([...row('금일합계', '10,000', .1), ...row('금일합계', '20,000', .3)]);
    expect(result.warnings.some(w => w.includes('여러 개'))).toBe(true);
  });
});

it('같은 행의 공급가·VAT 열을 서로의 금액에 연결하지 않는다', () => {
  const result = parseReceipt([line('공급가', .05, .2, .15), line('10,000', .25, .2, .15), line('VAT', .5, .2, .1), line('1,000', .75, .2, .15), ...row('금일합계', '11,000', .4)]);
  expect(result.amounts.supply?.value).toBe(10000);
  expect(result.amounts.vat?.value).toBe(1000);
});
it('상품·배송·할인은 나누고 결제액과 검산한다', () => {
  const result = parseReceipt([...row('상품금액', '40,000', .1), ...row('배송비', '3,000', .2), ...row('할인', '5,000', .3), ...row('결제금액', '38,000', .4)]);
  expect(result.checks.goodsAdjustments).toBe(38000);
  expect(result.checks.goodsAdjustmentsMatchTotal).toBe(true);
});
it('금액 열이 비면 단가를 금액으로 복제하지 않는다', () => {
  const result = parseReceipt(table().slice(0, -1));
  expect(result.items[0].amount).toBeNull();
  expect(result.checks.itemSum).toBeNull();
});

describe('OCR 독립 검토 1회차 회귀', () => {
  it('OCR-R1: 단가와 같은 순액이 있어도 명시 결제액을 덮어쓰지 않는다', () => {
    const result = parseReceipt([...row('매출총계', '30,000', .1), ...row('회수', '5,000', .2), ...row('결제금액', '30,000', .3), ...row('단가', '25,000', .4)]);
    expect(result.selectedTotal).toBeNull();
    expect(result.totalCandidates.some(c => c.source === 'derived')).toBe(false);
    expect(result.warnings.some(w => w.includes('충돌'))).toBe(true);
  });
  it('OCR-R1: 현금받음은 공급가+VAT와 같아도 합계 근거가 아니다', () => {
    const result = parseReceipt([...row('공급가', '20,000', .1), ...row('부가세', '2,000', .2), ...row('총합계', '30,000', .3), ...row('현금받음', '22,000', .4)]);
    expect(result.selectedTotal).toBeNull();
    expect(result.totalCandidates.some(c => c.source === 'derived')).toBe(false);
    expect(result.warnings.some(w => w.includes('충돌'))).toBe(true);
  });
  it.each(['- 5,000', '−5,000', '－ 5,000', '(5,000)', '( 5,000원 )'])('OCR-R2: 반품 %s의 음수를 유지한다', value => {
    expect(extractMoney(value)).toEqual([-5000]);
    expect(parseReceipt(row('금일합계', value, .1)).selectedTotal?.value).toBe(-5000);
  });
  it.each(['--5,000', '+-5,000', '(5,000', '5,000)', '(+5,000)', '5,000-'])('OCR-R2: 모호한 부호 %s를 양수로 확정하지 않는다', value => {
    expect(extractMoney(value)).toEqual([]);
    expect(parseReceipt(row('금일합계', value, .1)).selectedTotal).toBeNull();
  });
  it('OCR-R2: 별도 OCR 셀로 떨어진 마이너스와 할인 음수를 보존한다', () => {
    const result = parseReceipt([line('금일합계', .1), line('−', .6, .1, .03), line('5,000', .75, .1, .15), ...row('할인', '- 1,000', .3)]);
    expect(result.selectedTotal?.value).toBe(-5000);
    expect(result.amounts.discount?.value).toBe(-1000);
  });
  it.each(['배송비', '할인'])('OCR-R3: %s 라벨이 있지만 금액을 못 읽으면 검산을 중단한다', label => {
    const result = parseReceipt([...row('상품금액', '10,000', .1), line(label, .1, .2), ...row('결제금액', '10,000', .3)]);
    expect(result.checks.goodsAdjustments).toBeNull();
    expect(result.checks.goodsAdjustmentsMatchTotal).toBeNull();
    expect(result.warnings.some(w => w.includes(label) && w.includes('읽지 못'))).toBe(true);
  });
  it('OCR-R3: 라벨 부재와 읽힌 0원은 읽기 실패와 구분한다', () => {
    const absent = parseReceipt([...row('상품금액', '10,000', .1), ...row('결제금액', '10,000', .3)]);
    const zero = parseReceipt([...row('상품금액', '10,000', .1), ...row('배송비', '0', .2), ...row('결제금액', '10,000', .3)]);
    expect(absent.checks.goodsAdjustmentsMatchTotal).toBe(true);
    expect(zero.checks.goodsAdjustmentsMatchTotal).toBe(true);
  });
  it.each([0, 50, 500, 999])('OCR-R6: 한 셀 안의 작은 합계 %s원을 읽는다', value => {
    expect(parseReceipt([line(`금일합계 ${value}`)]).selectedTotal?.value).toBe(value);
  });
});
it.each(['합계 - 500', '총계 − 500', '합계 (500)', '총계 ‐500', '총계 ‑500'])('OCR-R2/R6: 일반 합계 라벨의 작은 음수 %s도 보존한다', text => {
  expect(parseReceipt([line(text)]).selectedTotal?.value).toBe(-500);
});
it.each(['5,000 -', '5,000 + ', '(5,000) -'])('OCR-R2: 금액 뒤에 떨어진 부호 %s는 미확정이다', value => {
  expect(extractMoney(value)).toEqual([]);
  expect(parseReceipt([line(`금일합계 ${value}`)]).selectedTotal).toBeNull();
});
it('OCR-R2: 한 셀에 두 금액이 있는 식에서 한 금액만 골라 확정하지 않는다', () => {
  expect(parseReceipt([line('금일합계 5,000 -1,000')]).selectedTotal).toBeNull();
});
