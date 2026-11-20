import { parseReceipt } from '../../lib/ocr/receiptParser';
import type { RecognizedLine } from '../../modules/rattle-text-recognition';

// Invented values/geometry only; no receipt text or identifiers from device exports.
const cell = (text: string, x = .1, y = .1, w = .2): RecognizedLine => ({ text, confidence: .9, box: { x, y, w, h: .02 } });
const pair = (label: string, value: string, y: number) => [cell(label, .1, y), cell(value, .75, y, .16)];
const tax = () => [...pair('공급가', '21.818', .3), ...pair('부가세', '2,182', .4)];

describe('실기기 후속 · 합성 문서 구조', () => {
  it.each(['l,OOO', '삼천원'])('R13 잔여: 숫자가 없는 인라인 회수 %s도 미확인 값으로 차단한다', value => {
    const parsed = parseReceipt([...tax(), ...pair('매출합계', '24,000', .5), cell(`회수 ${value}`, .1, .6)]);
    expect(parsed.amountStatus.returns).toBe('unreadable');
    expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
    expect(parsed.totalCandidates.some(candidate => candidate.value === 24000)).toBe(true);
  });
  it.each(['l,OOO', '삼천원'])('R13 대조: 별도 셀 회수 %s도 미확인 값으로 차단한다', value => {
    const parsed = parseReceipt([...tax(), ...pair('매출합계', '24,000', .5), ...pair('회수', value, .6)]);
    expect(parsed.amountStatus.returns).toBe('unreadable');
    expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
  });
  it.each(['회수', '회수액', '용기 회수액'])('R13 대조: 값 없는 %s 라벨은 빈 부가란으로 유지한다', label => {
    const parsed = parseReceipt([...tax(), ...pair('매출합계', '24,000', .5), cell(label, .1, .6)]);
    expect(parsed.selectedTotal?.value).toBe(24000); expect(parsed.suggestedTotal).toBeNull();
  });
  it.each([
    ['비영 회수 뒤 빈 중복란', ['3,000', '']],
    ['빈 중복란 뒤 비영 회수', ['', '3,000']],
    ['회수액 충돌', ['3,000', '4,000']],
    ['회수액 충돌 뒤 빈 중복란', ['3,000', '4,000', '']],
    ['0원 뒤 비영 회수 충돌', ['0', '3,000', '']],
    ['오독 숫자', ['3,O00']],
    ['오독 숫자 뒤 빈 중복란', ['3,O00', '']],
    ['비영 회수 뒤 오독 숫자', ['3,000', '3,O00']],
  ])('R13: %s를 빈 부가란으로 면제하지 않는다', (_name, values) => {
    const parsed = parseReceipt([...tax(), ...pair('매출합계', '24,000', .5),
      ...values.flatMap((value, index) => value ? pair('회수', value, .6 + index * .05) : [cell('회수', .1, .6 + index * .05)])]);
    expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
    expect(parsed.totalCandidates.some(candidate => candidate.value === 24000)).toBe(true);
  });
  it('R13: 한 관측의 오독 회수액도 빈 부가란으로 면제하지 않는다', () => {
    const parsed = parseReceipt([...tax(), ...pair('매출합계', '24,000', .5), cell('회수 3,O00', .1, .6)]);
    expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
  });
  it('R13 대조: 숫자가 없는 중복 회수·보증금 부가란은 세금 검산을 막지 않는다', () => {
    const parsed = parseReceipt([...tax(), ...pair('매출합계', '24,000', .5), cell('회수', .1, .6),
      cell('용기반납', .1, .65), cell('보증금', .1, .7)]);
    expect(parsed.selectedTotal?.value).toBe(24000); expect(parsed.suggestedTotal).toBeNull();
  });
  it.each(['매출합계', '매출총계'])('저신뢰 %s를 회수 차감 식의 독립 검산 근거로 사용하지 않는다', label => {
    const parsed = parseReceipt([...pair(label, '3,40,120', .1), ...pair('회수', '120', .2), ...pair('결제금액', '340,000', .3)]);
    expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
    expect(parsed.totalCandidates).toEqual(expect.arrayContaining([expect.objectContaining({ value: 340120, source: 'derived' })]));
    expect(parsed.guidanceCodes).toContain('INVALID_THOUSANDS_GROUPING');
  });
  it('표 머리글과 빈 회수란이 있어도 독립 공급가·VAT가 맞는 명시 매출합계를 확정한다', () => {
    const parsed = parseReceipt([
      cell('공급가', .2, .1, .08), cell('부가세', .4, .1, .08), cell('보증금', .6, .1, .08),
      cell('합계', .1, .2), cell('21,818', .4, .2, .1), cell('2,182', .6, .2, .1), cell('24,000', .8, .2, .1),
      ...tax(), ...pair('매출합계', '24,000', .5), cell('용기 회수액', .1, .6), cell('공병보증금', .1, .65), ...pair('전일 채권', '640,000', .7),
    ]);
    expect(parsed.amountStatus.supply).toBe('observed');
    expect(parsed.amountStatus.vat).toBe('observed');
    expect(parsed.selectedTotal?.value).toBe(24000);
    expect(parsed.suggestedTotal).toBeNull();
    expect(parsed.totalCandidates.some(c => c.value === 640000)).toBe(false);
  });
  it.each(['매출합계', '매출총계'])('%s와 세금 검산이 다르면 확정하지 않는다', label => {
    const parsed = parseReceipt([...tax(), ...pair(label, '25,000', .5)]);
    expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
  });
  it('읽지 못한 다른 명시 결제 라벨이 있으면 매출합계 예외로 우회하지 않는다', () => {
    const parsed = parseReceipt([...tax(), ...pair('매출합계', '24,000', .5), cell('결제금액', .1, .6)]);
    expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
  });
  it('회수액이 확인된 경우 기존 순액 검산을 우회해 매출총계로 확정하지 않는다', () => {
    const parsed = parseReceipt([...tax(), ...pair('매출총계', '24,000', .5), ...pair('회수', '3,000', .6), ...pair('결제금액', '24,000', .7)]);
    expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
  });
  it('품목 검산이 없으면 금일합계만 제안하고 전일잔액을 포함한 누적 합계는 경쟁에서 제외한다', () => {
    const parsed = parseReceipt([...pair('금일합계', '34,500', .3), ...pair('전일잔액', '640,000', .4), ...pair('합계', '674,500', .5)]);
    expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal?.value).toBe(34500);
    expect(parsed.totalCandidates.some(c => c.value === 674500)).toBe(true);
  });
  it('품목 검산이 맞으면 금일합계를 확정하고 누적 합계를 선택하지 않는다', () => {
    const parsed = parseReceipt([cell('품목명', .1, .1), cell('금액', .8, .1, .1), cell('가상 품목', .1, .2), cell('34,500', .8, .2, .1),
      ...pair('금일합계', '34,500', .3), ...pair('전일잔액', '640,000', .4), ...pair('합계', '674,500', .5)]);
    expect(parsed.selectedTotal?.value).toBe(34500); expect(parsed.suggestedTotal).toBeNull();
  });
  it('미완성 품목 표로 검산할 수 없으면 금일합계를 미확인 제안으로 남긴다', () => {
    const parsed = parseReceipt([cell('품목명', .1, .1), cell('금액', .8, .1, .1), cell('가상 품목', .1, .2),
      ...pair('금일합계', '34,500', .3), ...pair('전일잔액', '640,000', .4), ...pair('합계', '674,500', .5)]);
    expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal?.value).toBe(34500);
  });
  it('같은 행의 결제 라벨·결제수단·다른 셀 금액을 연결하고 주문 묶음 범위를 알린다', () => {
    const parsed = parseReceipt([cell('배송 4건 중 2', .05, .1), cell('총 결제금액', .05, .3), cell('쿠페이 머니', .4, .3), cell('99,800 원', .72, .3)]);
    expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal?.value).toBe(99800);
    expect(parsed.suggestedTotal?.warnings).toContain('주문 전체 결제금액이에요');
    expect(parsed.guidanceCodes).toContain('WHOLE_ORDER_TOTAL');
  });
  it('비정상 천단위 그룹은 낮은 신뢰도 후보만 남기고 상품가를 합계로 올리지 않는다', () => {
    const parsed = parseReceipt([cell('가상 상품 2개 12,000 원', .1, .1, .8), cell('총 결제금액', .05, .3), cell('쿠페이머니 3,40,120 원', .5, .3, .4)]);
    expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
    expect(parsed.totalCandidates).toEqual(expect.arrayContaining([expect.objectContaining({ value: 340120, source: 'derived' })]));
    expect(parsed.totalCandidates.find(c => c.value === 340120)!.parserConfidence).toBeLessThanOrEqual(.2);
    expect(parsed.totalCandidates.some(c => c.value === 12000)).toBe(false);
    expect(parsed.guidanceCodes).toContain('INVALID_THOUSANDS_GROUPING');
  });
  it('비정상 그룹은 계산값이 우연히 같아도 확정하지 않는다', () => {
    const parsed = parseReceipt([...pair('공급가액', '309,200', .1), ...pair('부가세', '30,920', .2), ...pair('결제금액', '3,40,120', .3)]);
    expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
    expect(parsed.guidanceCodes).toContain('INVALID_THOUSANDS_GROUPING');
  });
  it('매출합계 예외를 일반 결제금액의 미확인 보증금에 적용하지 않는다', () => {
    const parsed = parseReceipt([...tax(), ...pair('결제금액', '24,000', .5), cell('보증금', .1, .6)]);
    expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
  });
  it('합계 라벨 없는 상품·주문 목록에서는 결제 화면 안내 코드와 null을 유지한다', () => {
    const parsed = parseReceipt([cell('가상 상품', .1, .1), cell('2개 12,000 원', .1, .2), cell('주문 완료', .1, .3)]);
    expect(parsed.selectedTotal).toBeNull(); expect(parsed.suggestedTotal).toBeNull();
    expect(parsed.guidanceCodes).toContain('PAYMENT_SCREEN_REQUIRED');
    expect(parsed.warnings).toContain('결제 화면을 함께 올려주세요');
  });
});
