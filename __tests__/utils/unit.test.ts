import { recipeLineCost, recipeUnitOptionsFor, convertQuantity } from '../../lib/utils/unit';

describe('convertQuantity', () => {
  test('g를 kg로 환산한다', () => {
    expect(convertQuantity(200, 'g', 'kg')).toBeCloseTo(0.2);
  });
  test('같은 단위는 그대로', () => {
    expect(convertQuantity(3, 'kg', 'kg')).toBe(3);
  });
});

describe('recipeUnitOptionsFor', () => {
  test('kg 재고는 g/kg 선택 가능', () => {
    expect(recipeUnitOptionsFor({ unit: 'kg', unit_volume: null, unit_volume_unit: null })).toEqual(['g', 'kg']);
  });
  test('개당 용량 없는 개수 재고는 개만', () => {
    expect(recipeUnitOptionsFor({ unit: '개', unit_volume: null, unit_volume_unit: null })).toEqual(['개']);
  });
  test('개당 용량 있는 개수 재고는 개 + 용량단위', () => {
    expect(recipeUnitOptionsFor({ unit: '개', unit_volume: 500, unit_volume_unit: 'g' })).toEqual(['개', 'g']);
  });
});

describe('recipeLineCost', () => {
  test('개수 재고를 개 단위로 쓰면 개당 단가 × 개수', () => {
    const ing = { unit: '개', last_price: 1000, unit_volume: 500, unit_volume_unit: 'g' };
    expect(recipeLineCost(2, '개', ing)).toBe(2000);
  });

  test('개수 재고를 g로 쓰면 개당 용량으로 환산해 원가 계산', () => {
    // 1통 = 500g, 1통 1000원 → 100g 사용 시 (100/500)*1000 = 200원
    const ing = { unit: '개', last_price: 1000, unit_volume: 500, unit_volume_unit: 'g' };
    expect(recipeLineCost(100, 'g', ing)).toBe(200);
  });

  test('무게 재고는 단위 환산 후 단가 곱', () => {
    // 1kg당 10000원, 200g 사용 → 2000원
    const ing = { unit: 'kg', last_price: 10000, unit_volume: null, unit_volume_unit: null };
    expect(recipeLineCost(200, 'g', ing)).toBeCloseTo(2000);
  });
});
