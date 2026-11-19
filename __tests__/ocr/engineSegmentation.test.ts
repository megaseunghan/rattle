import { parseReceipt } from '../../lib/ocr/receiptParser';
import type { RecognizedLine } from '../../modules/rattle-text-recognition';
const cell = (text: string, x: number, y: number, w = .1, h = .012): RecognizedLine => ({ text, confidence: .8, box: { x, y, w, h } });

describe('OCR 엔진 분할 차이 · 합성 원문만 사용', () => {
  it.each(['vision', 'mlkit'])('%s 표 머리글과 기울기를 정렬해 금일합계를 같은 행에서 찾는다', engine => {
    const header = engine === 'vision'
      ? [cell('상품명', .2, .25), cell('단가', .68, .24), cell('금액', .8, .237)]
      : [cell('상품명', .2, .25), cell('단 가 금 액', .68, .237, .22)];
    const input = [...header, cell('안내', .1, .405), cell('금일합계', .55, .396), cell('31,450', .84, .389),
      cell('전일잔액', .55, .42), cell('700,000', .84, .413)];
    const parsed = parseReceipt(input);
    expect(parsed.totalCandidates[0].value).toBe(31450);
    expect(parsed.selectedTotal).toBeNull();
    expect(parsed.suggestedTotal).toBeNull();
  });
  it('띄어진 합·계·금·액 라벨을 합치되 출처 상자는 원본 그대로 보관한다', () => {
    const input = [cell('합', .1, .2, .02), cell('계', .14, .2, .02), cell('금', .18, .2, .02), cell('액', .22, .2, .02), cell('48,620', .7, .2)];
    const parsed = parseReceipt(input, 'synthetic');
    expect(parsed.suggestedTotal?.value).toBe(48620);
    expect(parsed.suggestedTotal?.rawText).toBe('합 계 금 액 48,620');
    expect(parsed.suggestedTotal?.sourceBoxes).toEqual(expect.arrayContaining(input.map(l => l.box)));
  });
  it.each(['총 87,650원', '가상카드/일시불 87,650 원', '가상카드/일시물 87,650 원'])('결제 값에 합쳐진 주석 %s를 분리한다', text => {
    expect(parseReceipt([cell('총 결제금액', .1, .2), cell(text, .5, .2, .4)]).suggestedTotal?.value).toBe(87650);
  });
  it('별도 또는 같은 값 셀의 인수 표시는 금액에 합치지 않는다', () => {
    expect(parseReceipt([cell('총합계', .1, .2), cell('48,620 인수', .6, .2, .25)]).suggestedTotal?.value).toBe(48620);
  });
  it('명시 합계의 공백 천단위는 금액 열에 있어도 검산 없이는 후보만 남긴다', () => {
    const parsed = parseReceipt([cell('품목명', .1, .1), cell('수량', .5, .1), cell('금액', .7, .1),
      cell('금일합계', .1, .2), cell('38 760', .7, .2)]);
    expect(parsed.selectedTotal).toBeNull();
    expect(parsed.suggestedTotal).toBeNull();
    expect(parsed.totalCandidates[0].value).toBe(38760);
    expect(parsed.totalCandidates[0].source).toBe('derived');
    expect(parsed.warnings.some(w => w.includes('공백'))).toBe(true);
  });
  it('서로 다른 숫자 셀을 공백 천단위로 합치지 않는다', () => {
    const parsed = parseReceipt([cell('금일합계', .1, .2), cell('38', .6, .2), cell('760', .8, .2)]);
    expect(parsed.selectedTotal).toBeNull();
  });
  it('머리글의 공급가·VAT 열을 읽기 실패로 오인하지 않는다', () => {
    const parsed = parseReceipt([cell('상품명', .1, .1), cell('공급가액 부가세', .6, .1, .25),
      cell('공급가액', .1, .4), cell('20,000', .7, .4), cell('부가세', .1, .5), cell('2,000', .7, .5), cell('총합계', .1, .6), cell('22,000', .7, .6)]);
    expect(parsed.amountStatus.supply).toBe('observed'); expect(parsed.amountStatus.vat).toBe('observed');
    expect(parsed.selectedTotal?.value).toBe(22000);
  });
  it('구조를 고쳐도 잔액·단가·현금받음에서 결제 합계를 만들어내지 않는다', () => {
    const parsed = parseReceipt([cell('공급가액', .1, .1), cell('20,000', .7, .1), cell('부가세', .1, .2), cell('2,000', .7, .2),
      cell('총합계', .1, .3), cell('30,000', .7, .3), cell('현금받음 22,000', .5, .4, .4)]);
    expect(parsed.selectedTotal).toBeNull();
  });
});
it('같은 행의 공급가액·부가세와 실제 금액은 머리글로 건너뛰지 않는다', () => {
  const parsed = parseReceipt([cell('공급가액', .05, .2), cell('10,000', .25, .2), cell('부가세', .5, .2), cell('1,000', .75, .2)]);
  expect(parsed.amounts.supply?.value).toBe(10000); expect(parsed.amounts.vat?.value).toBe(1000);
});
it('표의 합계 이후 안내문을 추가 품목으로 세지 않는다', () => {
  const parsed = parseReceipt([cell('품목명', .1, .1), cell('금액', .7, .1), cell('가상 품목', .1, .2), cell('10,000', .7, .2),
    cell('총합계', .1, .3), cell('10,000', .7, .3), cell('원산지 안내', .1, .4)]);
  expect(parsed.items).toHaveLength(1);
});
it('회수액이 불명확하면 매출총계만으로 결제 합계를 확정하지 않는다', () => {
  const parsed = parseReceipt([cell('매출총계', .1, .2), cell('30,000', .7, .2), cell('회수', .1, .3)]);
  expect(parsed.selectedTotal).toBeNull();
  expect(parsed.warnings.some(w => w.includes('회수액'))).toBe(true);
});
