import type { StoreFillPatch } from '../../types';

/** 마저 채우기 4묶음(fill-v5). 홈 유도 시트·알림 카드와 마저 채우기 화면이 같은 기준으로 센다. */
export type StoreFillGroup = 'payday' | 'headcount' | 'business' | 'insurance';

export const STORE_FILL_GROUPS: readonly StoreFillGroup[] = ['payday', 'headcount', 'business', 'insurance'];

export type StoreFillValues = Required<StoreFillPatch>;

/** 묶음별 완료 판정. 사업자번호는 선택이라 세지 않는다. 직원 수 '잘 모르겠어요'도 고른 것으로 센다. */
export function isStoreFillGroupDone(group: StoreFillGroup, s: StoreFillValues): boolean {
  switch (group) {
    case 'payday':
      return s.payroll_close_day != null && s.payday_day != null && s.payday_month_offset != null;
    case 'headcount':
      return s.headcount_class != null;
    case 'business':
      return s.business_entity_type != null && s.vat_type != null;
    case 'insurance':
      return s.social_insurance_enrolled === false
        || (s.social_insurance_enrolled === true && s.industrial_accident_industry != null);
  }
}

export function countStoreFill(s: StoreFillValues): number {
  return STORE_FILL_GROUPS.filter(group => isStoreFillGroupDone(group, s)).length;
}

export function isStoreFillComplete(s: StoreFillValues): boolean {
  return countStoreFill(s) === STORE_FILL_GROUPS.length;
}
