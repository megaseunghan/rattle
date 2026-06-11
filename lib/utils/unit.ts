import { Ingredient } from '../../types';

// 재고 기준 단위 (3종 고정)
export const STOCK_UNITS = ['kg', 'L', '개'] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];

// 각 단위를 기준량(kg / L / 개)으로 환산하는 계수
const UNIT_TO_BASE: Record<string, number> = {
  mg: 0.000001,
  g: 0.001,
  kg: 1,
  ml: 0.001,
  mL: 0.001,
  L: 1,
  l: 1,
  개: 1,
  EA: 1,
  ea: 1,
};

/**
 * 레시피 입력 단위에 따라 선택 가능한 단위 목록.
 * 재고 단위가 무게면 g/kg, 부피면 mL/L, 개수면 개.
 */
export function recipeUnitOptions(stockUnit: string): string[] {
  if (stockUnit === 'kg') return ['g', 'kg'];
  if (stockUnit === 'L') return ['mL', 'L'];
  return ['개'];
}

/**
 * 레시피에서 한 재료에 선택 가능한 입력 단위.
 * 개수 재고라도 "개당 용량"이 등록돼 있으면 g/mL로도 입력 가능.
 */
export function recipeUnitOptionsFor(
  ingredient: Pick<Ingredient, 'unit' | 'unit_volume' | 'unit_volume_unit'>,
): string[] {
  if (ingredient.unit === '개' && ingredient.unit_volume && ingredient.unit_volume_unit) {
    return ['개', ingredient.unit_volume_unit];
  }
  return recipeUnitOptions(ingredient.unit);
}

/**
 * fromUnit 기준 수량을 stockUnit(재고 기준 단위) 기준 수량으로 환산.
 * 예) convertQuantity(200, 'g', 'kg') === 0.2
 * 차원이 다른 단위를 섞으면 의미가 없으므로 호출 측에서 같은 차원으로 맞춘다.
 */
export function convertQuantity(qty: number, fromUnit: string, stockUnit: string): number {
  const from = UNIT_TO_BASE[fromUnit] ?? 1;
  const to = UNIT_TO_BASE[stockUnit] ?? 1;
  return (qty * from) / to;
}

/**
 * 레시피 한 줄(재료)의 원가.
 * quantity(lineUnit) → 재고 기준단위로 환산 후 재고 단가(last_price, 기준단위당) 곱.
 */
export function recipeLineCost(
  quantity: number,
  lineUnit: string,
  ingredient: Pick<Ingredient, 'unit' | 'last_price' | 'unit_volume' | 'unit_volume_unit'>,
): number {
  // 개수 재고를 g/mL로 입력한 경우: 개당 용량으로 나눠 "개" 환산 후 개당 단가 곱.
  if (
    ingredient.unit === '개' &&
    lineUnit !== '개' &&
    ingredient.unit_volume &&
    ingredient.unit_volume_unit
  ) {
    const inVolUnit = convertQuantity(quantity, lineUnit, ingredient.unit_volume_unit);
    const countFraction = inVolUnit / ingredient.unit_volume;
    return countFraction * (ingredient.last_price ?? 0);
  }
  const converted = convertQuantity(quantity, lineUnit, ingredient.unit);
  return converted * (ingredient.last_price ?? 0);
}

export function formatStock(qty: number, ingredient: Pick<Ingredient, 'unit'>): string {
  const display = Number.isInteger(qty) ? String(qty) : qty.toFixed(2);
  return `${display}${ingredient.unit}`;
}

export function stockUnit(ingredient: Pick<Ingredient, 'unit'>): string {
  return ingredient.unit;
}
