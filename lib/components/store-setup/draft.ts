/** 매장 만들기 입력 초안: 질문 순서·검증·기기 임시 저장 형식·서버 입력 변환. */
import type { FinancialShareScope } from '../../../types';
import type { CreateStoreInput } from '../../services/stores';
import { DEFAULT_PROBATION_RATE } from '../../payroll/probation';
import {
  DEFAULT_CLOSING, DEFAULT_DAY_SPLIT, parseRatePercent, toClosingTime, type Meridiem, type ProbationMonths,
} from './format';

export const STORE_SETUP_QUESTIONS = ['name', 'address', 'closing', 'share', 'probation'] as const;
export type StoreSetupQuestion = typeof STORE_SETUP_QUESTIONS[number];

export const NAME_MAX = 80;
export const ADDRESS_MAX = 200;
export const DEFAULT_RATE_TEXT = String(Math.round(DEFAULT_PROBATION_RATE * 100));

export interface StoreSetupDraft {
  name: string;
  address: string;
  isOpen24h: boolean;
  meridiem: Meridiem;
  hour12: number;
  scope: FinancialShareScope | null;
  probationMonths: ProbationMonths;
  rateText: string;
  /** 시도당 하나. 재시도가 매장을 두 번 만들지 않게 한다. */
  requestId: string;
  /** 지금까지 열린 마지막 질문 위치. */
  step: number;
  /** '매장 시작하기'를 누른 뒤. 결과를 모르면 같은 내용·같은 요청 ID로만 다시 시도한다. */
  submitted?: boolean;
}

export function emptyDraft(requestId: string): StoreSetupDraft {
  return {
    name: '', address: '', isOpen24h: false, meridiem: DEFAULT_CLOSING.meridiem, hour12: DEFAULT_CLOSING.hour12,
    scope: null, probationMonths: 0, rateText: DEFAULT_RATE_TEXT, requestId, step: 0,
  };
}

/** 24시간 영업 여부를 바꾸면 휠도 그 방식의 기본값으로 옮긴다. */
export function withOpen24h(draft: StoreSetupDraft, isOpen24h: boolean): StoreSetupDraft {
  if (draft.isOpen24h === isOpen24h) return draft;
  const time = isOpen24h ? DEFAULT_DAY_SPLIT : DEFAULT_CLOSING;
  return { ...draft, isOpen24h, meridiem: time.meridiem, hour12: time.hour12 };
}

export function canAnswer(question: StoreSetupQuestion, draft: StoreSetupDraft): boolean {
  switch (question) {
    case 'name': return draft.name.trim().length > 0 && draft.name.trim().length <= NAME_MAX;
    case 'address': return draft.address.trim().length <= ADDRESS_MAX;
    case 'closing': return draft.hour12 >= 1 && draft.hour12 <= 12;
    case 'share': return draft.scope != null;
    case 'probation': return draft.probationMonths === 0 || parseRatePercent(draft.rateText) != null;
    default: return false;
  }
}

/** 처음으로 답이 모자란 질문 위치. 다 됐으면 마지막 위치. */
export function firstIncomplete(draft: StoreSetupDraft): number {
  const index = STORE_SETUP_QUESTIONS.findIndex(question => !canAnswer(question, draft));
  return index === -1 ? STORE_SETUP_QUESTIONS.length - 1 : index;
}

export function isComplete(draft: StoreSetupDraft): boolean {
  return STORE_SETUP_QUESTIONS.every(question => canAnswer(question, draft));
}

export function toCreateInput(draft: StoreSetupDraft): CreateStoreInput {
  if (!isComplete(draft) || draft.scope == null) throw new Error('Incomplete store setup draft');
  const rate = parseRatePercent(draft.rateText);
  return {
    name: draft.name.trim(),
    shareScope: draft.scope,
    requestId: draft.requestId,
    address: draft.address.trim() ? draft.address.trim() : null,
    closingTime: toClosingTime(draft.meridiem, draft.hour12),
    isOpen24h: draft.isOpen24h,
    probationMonths: draft.probationMonths,
    probationRate: draft.probationMonths === 0 || rate == null ? DEFAULT_PROBATION_RATE : rate / 100,
  };
}

const SCOPES: readonly (FinancialShareScope | null)[] = [null, 'none', 'regular_only', 'all_staff'];
const MONTHS: readonly ProbationMonths[] = [0, 1, 2, 3];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value != null;

/**
 * 기기에 남은 초안을 읽는다. 이전 형식(이름·POS·공유만 있던 v1)도 이름·공유·요청 ID를 이어받는다.
 * 모양이 다르면 null(새로 시작).
 */
export function parseDraft(value: unknown): StoreSetupDraft | null {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.requestId !== 'string' || !value.requestId) return null;
  const scope = value.scope ?? null;
  if (!SCOPES.includes(scope as FinancialShareScope | null)) return null;
  const base = emptyDraft(value.requestId);
  const months = MONTHS.includes(value.probationMonths as ProbationMonths) ? value.probationMonths as ProbationMonths : 0;
  const meridiem = value.meridiem === '오전' || value.meridiem === '오후' ? value.meridiem : base.meridiem;
  const hour = Number.isInteger(value.hour12) && (value.hour12 as number) >= 1 && (value.hour12 as number) <= 12 ? value.hour12 as number : base.hour12;
  return {
    ...base,
    name: value.name.slice(0, NAME_MAX),
    address: typeof value.address === 'string' ? value.address.slice(0, ADDRESS_MAX) : '',
    isOpen24h: value.isOpen24h === true,
    meridiem, hour12: hour,
    scope: scope as FinancialShareScope | null,
    probationMonths: months,
    rateText: typeof value.rateText === 'string' ? value.rateText.replace(/\D/g, '').slice(0, 3) : base.rateText,
    step: Number.isInteger(value.step) ? Math.max(0, Math.min(STORE_SETUP_QUESTIONS.length - 1, value.step as number)) : 0,
    // v1 초안(step 없음)은 새 질문(주소·마감·수습)에 답한 적이 없으므로 잠그지 않고 이어서 묻는다.
    // 요청 ID는 그대로 두어, 이미 만들어진 매장이면 서버가 같은 매장을 돌려준다.
    ...(value.submitted === true && 'step' in value ? { submitted: true } : {}),
  };
}

/** 복원할 질문 위치: 저장한 위치와 처음 모자란 질문 중 앞선 쪽. 제출한 초안은 마지막 질문. */
export function restoredStep(draft: StoreSetupDraft): number {
  if (draft.submitted && isComplete(draft)) return STORE_SETUP_QUESTIONS.length - 1;
  return Math.min(draft.step, firstIncomplete(draft));
}
