/* design-system: DESIGN.md — 급여 계좌 은행 버튼 목록(확정 시안 순서: 인터넷은행 → 1금융 → 2금융, 맨 끝 직접 입력).
 * 버튼에는 짧은 이름, 접근성 라벨과 저장 값은 정식 이름이다. 3금융(대부업)은 급여 계좌를 열 수 없어 넣지 않는다. */

export interface BankOption {
  /** 버튼에 보이는 짧은 이름 */
  short: string;
  /** 접근성 라벨·저장 값 */
  name: string;
}

export const BANK_OPTIONS: readonly BankOption[] = [
  { short: '토스뱅크', name: '토스뱅크' },
  { short: '카카오뱅크', name: '카카오뱅크' },
  { short: '케이뱅크', name: '케이뱅크' },
  { short: '국민', name: '국민은행' },
  { short: '신한', name: '신한은행' },
  { short: '우리', name: '우리은행' },
  { short: '하나', name: '하나은행' },
  { short: 'NH농협', name: 'NH농협은행' },
  { short: 'IBK기업', name: 'IBK기업은행' },
  { short: 'SC제일', name: 'SC제일은행' },
  { short: '씨티', name: '한국씨티은행' },
  { short: 'KDB산업', name: 'KDB산업은행' },
  { short: 'Sh수협', name: 'Sh수협은행' },
  { short: 'iM뱅크', name: 'iM뱅크(구 대구은행)' },
  { short: '부산', name: 'BNK부산은행' },
  { short: '경남', name: 'BNK경남은행' },
  { short: '광주', name: '광주은행' },
  { short: '전북', name: '전북은행' },
  { short: '제주', name: '제주은행' },
  { short: '새마을금고', name: '새마을금고' },
  { short: '신협', name: '신협' },
  { short: '지역농축협', name: '지역농축협' },
  { short: '수협', name: '수협(회원조합)' },
  { short: '산림조합', name: '산림조합' },
  { short: '우체국', name: '우체국' },
  { short: 'SBI저축', name: 'SBI저축은행' },
  { short: 'OK저축', name: 'OK저축은행' },
  { short: '웰컴저축', name: '웰컴저축은행' },
  { short: '미래에셋', name: '미래에셋증권' },
  { short: '한국투자', name: '한국투자증권' },
  { short: '키움', name: '키움증권' },
];

export const OTHER_BANK_LABEL = '직접 입력';

export function isListedBank(name: string | null | undefined): boolean {
  const trimmed = name?.trim();
  return !!trimmed && BANK_OPTIONS.some(bank => bank.name === trimmed);
}

/** 화면 표시용 짧은 이름. 목록에 없으면 입력한 이름 그대로. */
export function bankShortName(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? '';
  return BANK_OPTIONS.find(bank => bank.name === trimmed)?.short ?? trimmed;
}
