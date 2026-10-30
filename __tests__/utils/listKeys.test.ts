import { dailyItemKey, entityKey, stringKey } from '../../lib/utils/listKeys';
import type { DailyItem } from '../../types';
const row = (itemId: string, itemName: string): DailyItem => ({ itemId, itemName, categoryName: '식사', quantity: 1, totalAmount: 100 });
it('상품 ID와 ID 없는 동명 상품의 키를 구분한다', () => {
  const rows = [row('국밥', '메뉴'), row('', '국밥'), row('second', '메뉴')];
  expect(new Set(rows.map(dailyItemKey)).size).toBe(rows.length);
});
it('정렬·합계·상품명 변경에도 상품 ID 키는 유지한다', () => {
  const first = row('one', '변경 전');
  expect(dailyItemKey({ ...first, quantity: 10, itemName: '변경 후', totalAmount: 1000 })).toBe(dailyItemKey(first));
  const rows = [first, row('two', '둘')];
  expect([...rows].reverse().map(dailyItemKey)).toEqual(rows.map(dailyItemKey).reverse());
});
it('인덱스 대신 엔티티 ID와 고유 문자열을 사용한다', () => {
  expect(entityKey({ id: 'ingredient' })).toBe('ingredient');
  expect(stringKey('식사')).toBe('식사');
});
