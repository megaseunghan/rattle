import { buildHomeAlerts } from '../../lib/services/homeAlerts';
import { validatePurchaseType } from '../../lib/services/purchaseTypes';
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
const now = new Date(2026, 9, 19);
const item = { id: 'ingredient', name: '양파', current_stock: 0, min_stock: 0, unit: 'kg', updated_at: 'version-1' };
it('안전 수량 0인 실제 품절도 안내하고 수량이 있는 무기준 재고는 제외한다', () => {
  expect(buildHomeAlerts({ now, stock: [item] })[0].message).toContain('현재 품절 상태');
  expect(buildHomeAlerts({ now, stock: [{ ...item, current_stock: 1 }] })).toEqual([]);
});
it('안전 수량 이하의 양수 재고는 부족 안내로 구분한다', () => {
  expect(buildHomeAlerts({ now, stock: [{ ...item, current_stock: 1, min_stock: 2 }] })[0].message).toContain('1kg');
});
it('다시 변경된 품목은 과거 읽음 키와 다른 알림으로 생성한다', () => {
  const first = buildHomeAlerts({ now, stock: [item] })[0];
  const next = buildHomeAlerts({ now, stock: [{ ...item, updated_at: 'version-2' }] })[0];
  expect(first.key).not.toBe(next.key);
  expect(first.route).toBe('/stock/ingredient');
});
it('재고 전용 조회에서는 월말에도 재무 알림을 만들지 않는다', () => {
  expect(buildHomeAlerts({ now: new Date(2026, 9, 31), stock: [] })).toEqual([]);
});
it('고정비는 월별, 월말 안내는 날짜별로 읽음 범위를 나눈다', () => {
  const alerts = buildHomeAlerts({ now: new Date(2026, 9, 31), stock: [], fixedExpenseMissing: true });
  expect(alerts.map(alert => alert.key)).toEqual(['fixedExpenseMissing:2026-10', 'monthClose:2026-10-31']);
});
it.each(['', ' ', '전체', '가'.repeat(41)])('잘못된 매입 유형 %p은 거부한다', value => {
  expect(() => validatePurchaseType(value)).toThrow();
});
it('매입 유형은 공백을 정리하고 사용자 이름을 보존한다', () => {
  expect(validatePurchaseType('  도매상  ')).toBe('도매상');
});
