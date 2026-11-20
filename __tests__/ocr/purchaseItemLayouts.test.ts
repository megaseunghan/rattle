import { parseReceipt } from '../../lib/ocr/receiptParser';
import type { RecognizedLine } from '../../modules/rattle-text-recognition';

const cell = (text: string, x: number, y: number): RecognizedLine =>
  ({ text, box: { x, y, w: .08, h: .02 }, confidence: .91 });

it('묶음 옵션과 주문 수량을 구분하고 배송·추천 영역을 제외한다', () => {
  const lines = ['쿠팡 주문 완료', '배송 3건 중 1', '가상 찻잔', '옵션 파랑 6개', '7,150원', '수량: 1개',
    '가상 접시', '4,120원', '수량: 2개', '총 결제금액', '추천 포크', '3,100원', '수량: 1개'];
  const p = parseReceipt(lines.map((v, i) => cell(v, .35, .04 * i)));
  expect(p.items.map(i => [i.name.value, i.quantity?.value, i.amount?.value, i.needsReview])).toEqual([
    ['가상 찻잔 옵션 파랑 6개', 1, 7150, true], ['가상 접시', 2, undefined, true],
  ]);
  expect(p.items[0].name.sourceBoxes).toHaveLength(2);
  expect(p.checks.itemSum).toBeNull();
  expect(p.selectedTotal).toBeNull();
});

it.each(['2,6,50원', '4,250원 7,150원'])('잘못된 가격이나 복수 가격을 금액으로 채우지 않는다', price => {
  const p = parseReceipt(['쿠팡 주문 완료', '가상 잔', price, '수량: 1개'].map((v,i) => cell(v,.35,.04*i)));
  expect(p.items.every(item => item.amount === null)).toBe(true);
});

it('주류 표의 행 금액과 요약을 구분하고 복합 단위 수량을 추정하지 않는다', () => {
  const p = parseReceipt([cell('매출상품', .1,.1), cell('수량', .5,.1), cell('매출합계', .75,.1),
    cell('가상 음료', .1,.2), cell('2/1', .5,.2), cell('9,450', .75,.2),
    cell('소계', .1,.3), cell('9,450', .75,.3)]);
  expect(p.items).toHaveLength(1);
  expect(p.items[0]).toMatchObject({ quantity: null, amount: { value: 9450 }, needsReview: true });
  expect(p.checks.itemSum).toBe(9450);
});

it.each([['300',11740],['',undefined]])('공급가·세액·용기보증금 열을 독립적으로 읽는다', (deposit, expected) => {
  const header = ['품명','규격','수량','단가','공급가','세액','보증금'];
  const values = ['가상 주류','소병','2','5,200','10,400','1,040',String(deposit)];
  const lines = [header, values].flatMap((row,i) => row.flatMap((v,j) => v ? [cell(v,.03+j*.14,.1+i*.1)] : []));
  const p = parseReceipt(lines);
  expect(p.items[0].name.value).toBe('가상 주류');
  expect(p.items[0].amount?.value).toBe(expected);
  expect(p.items[0].unitPrice?.value).toBe(5200);
});

it.each([true,false])('분리된 품명·단가·금액 열 제목을 읽고 지워진 금액 열은 보류한다 (%s)', visible => {
  const lines = [cell('순번',.02,.1), cell('규격',.42,.1), cell('BOX',.52,.1), cell('EA',.62,.1),
    cell('단가',.72,.1), cell('비고',.93,.1), cell('12345',.02,.2), cell('가상 음료',.14,.2),
    cell('4',.62,.2), cell('2,450',.72,.2), cell('9,800',.84,.2)];
  if (visible) lines.push(cell('금액',.84,.1));
  const p = parseReceipt(lines);
  expect(p.items).toHaveLength(1);
  expect(p.items[0]).toMatchObject({ name: { value: '가상 음료' }, unitPrice: { value: 2450 }, quantity: null, needsReview: true });
  expect(p.items[0].amount?.value).toBe(visible ? 9800 : undefined);
  expect(p.selectedTotal).toBeNull();
});

it('가격의 원 단위가 깨져도 주문 수량 앞의 품목명을 보존한다', () => {
  const lines = ['쿠팡 주문 완료', '가상 접시', '3,210 l', '수량: 1개'];
  const p = parseReceipt(lines.map((v,i) => cell(v,.35,.04*i)));
  expect(p.items[0]).toMatchObject({ name: { value: '가상 접시' }, quantity: { value: 1 }, amount: null, needsReview: true });
});
