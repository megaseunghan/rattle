import type { BusinessEntityType, HeadcountClass, PaydayHolidayRule, VatType } from '../../../types';
import type { StoreFillGroup } from '../../utils/storeFill';

export interface FillOption<T> { value: T; title: string; description?: string }

export const GROUP_LABELS: Record<StoreFillGroup, string> = {
  payday: '급여 날짜', headcount: '직원 수', business: '사업자', insurance: '4대보험',
};

export const HOLIDAY_OPTIONS: FillOption<PaydayHolidayRule>[] = [
  { value: 'before', title: '앞당겨서', description: '바로 앞 평일에 줘요' },
  { value: 'same', title: '그날 그대로', description: '쉬는 날이어도 그날 줘요' },
  { value: 'after', title: '미뤄서', description: '바로 다음 평일에 줘요' },
];

export const HEADCOUNT_OPTIONS: FillOption<HeadcountClass>[] = [
  { value: 'five_or_more', title: '5인 이상', description: '연장·야간·휴일 가산수당과 연차가 적용돼요' },
  { value: 'under_five', title: '5인 미만', description: '가산수당·연차를 꼭 주지 않아도 돼요' },
  { value: 'unknown', title: '잘 모르겠어요', description: '나중에 정해도 돼요' },
];

export const INSURANCE_OPTIONS: FillOption<boolean>[] = [
  { value: true, title: '가입했어요', description: '직원 급여에서 4대보험을 떼요' },
  { value: false, title: '아직이에요', description: '가입 전이면 보험료를 떼지 않아요' },
];

/** 산재 업종 '목록에 없어요'(서버 업종 표 code, 20261128120000). 요율이 없어 손익에 산재보험을 넣지 않는다. */
export const INDUSTRY_UNLISTED = 'unlisted';
export const INDUSTRY_HINTS: Record<string, string> = { retail_food_lodging: '음식점·카페·편의점·숙박' };

export const ENTITY_OPTIONS: FillOption<BusinessEntityType>[] = [
  { value: 'individual', title: '개인' }, { value: 'corporation', title: '법인' },
];
export const VAT_OPTIONS: FillOption<VatType>[] = [
  { value: 'general', title: '일반과세' }, { value: 'simplified', title: '간이과세' },
];

export function optionTitle<T>(options: FillOption<T>[], value: T | null | undefined): string | null {
  return value == null ? null : options.find(option => option.value === value)?.title ?? null;
}

/** 제목 아래 설명: 안 채운 묶음 하나의 쓸모를 화면을 열 때마다 무작위로 보여 준다. */
export const GROUP_TIPS: Record<StoreFillGroup, string> = {
  payday: '급여 날짜를 정하면 월급날 3일 전과 당일에 알려 드려요.',
  headcount: '상시 근로자가 5명 이상인지 정해 두면 가산수당·연차를 챙겨야 하는지 알 수 있어요.',
  business: '사업자 정보를 넣어 두면 세무사에게 보낼 자료에 함께 적어요.',
  insurance: '4대보험에 가입했는지 알려 주시면 직원 급여에서 뗄 보험료를 예상할 수 있어요.',
};
export const DONE_TIP = '다 채웠어요. 바뀌면 언제든 고칠 수 있어요.';
export const READ_ONLY_TIP = '사장님이 정한 정보예요. 바꾸려면 사장님께 말씀해 주세요.';
export const UNSET_LABEL = '아직 안 정했어요';

export function pickTip(left: readonly StoreFillGroup[], random: () => number = Math.random): StoreFillGroup | null {
  if (left.length === 0) return null;
  return left[Math.min(left.length - 1, Math.floor(random() * left.length))];
}

/** 사업자번호 입력: 숫자 10자리를 000-00-00000 으로 맞춘다. */
export function formatBusinessNumber(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 10);
  if (digits.length > 5) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  if (digits.length > 3) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return digits;
}

export function isBusinessNumberInputValid(input: string): boolean {
  const length = input.replace(/\D/g, '').length;
  return length === 0 || length === 10;
}
