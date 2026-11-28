/** '지급 완료로 바꾸기' 시트의 입력 상태. 예상 공제는 서비스(previewDailyLaborPayment)가 정하고, 여기서는 고친 값과 검사만 다룬다. */
import { addDays } from '../../payroll';
import { deductionError, isPayableDate, previewDailyLaborPayment, type DailyLaborDeductions, type DailyLaborPaymentGroup } from '../../services/dailyLaborers';
import type { DailyLaborEntry } from '../../../types';

export type DeductionKey = keyof DailyLaborDeductions;
export const DEDUCTION_FIELDS: readonly (readonly [DeductionKey, string])[] = [
  ['income_tax', '소득세'], ['local_income_tax', '지방소득세'], ['employment_insurance', '고용보험'],
];

export interface PaymentDraftGroup {
  laborerId: string;
  entries: DailyLaborEntry[];
  gross: number;
  estimate: DailyLaborDeductions;
  actual: DailyLaborDeductions;
}

export type PayDayChoice = 'today' | 'yesterday' | 'pick';

function pickDeductions(source: DailyLaborDeductions): DailyLaborDeductions {
  return { income_tax: source.income_tax, local_income_tax: source.local_income_tax, employment_insurance: source.employment_insurance };
}

/** 고른 기록을 사람별로 묶고 예상 공제를 채운다. 순서는 기록 순서를 따른다. */
export function createPaymentDraft(entries: DailyLaborEntry[], selectedIds: ReadonlySet<string>): PaymentDraftGroup[] {
  const picked = entries.filter(e => !e.payment_id && selectedIds.has(e.id));
  const laborerIds = [...new Set(picked.map(e => e.laborer_id))];
  return laborerIds.map(laborerId => {
    const own = picked.filter(e => e.laborer_id === laborerId);
    const pay = previewDailyLaborPayment(own);
    return { laborerId, entries: own, gross: pay.gross, estimate: pickDeductions(pay), actual: pickDeductions(pay) };
  });
}

function updateGroup(groups: PaymentDraftGroup[], laborerId: string, key: DeductionKey, value: (g: PaymentDraftGroup) => number): PaymentDraftGroup[] {
  return groups.map(g => (g.laborerId === laborerId ? { ...g, actual: { ...g.actual, [key]: value(g) } } : g));
}

export function setDeduction(groups: PaymentDraftGroup[], laborerId: string, key: DeductionKey, value: number): PaymentDraftGroup[] {
  return updateGroup(groups, laborerId, key, () => value);
}

export function resetDeduction(groups: PaymentDraftGroup[], laborerId: string, key: DeductionKey): PaymentDraftGroup[] {
  return updateGroup(groups, laborerId, key, g => g.estimate[key]);
}

export function isEdited(group: Pick<PaymentDraftGroup, 'estimate' | 'actual'>, key: DeductionKey): boolean {
  return group.actual[key] !== group.estimate[key];
}

export function hasEdits(groups: PaymentDraftGroup[]): boolean {
  return groups.some(g => DEDUCTION_FIELDS.some(([key]) => isEdited(g, key)));
}

export function netOf(group: Pick<PaymentDraftGroup, 'gross' | 'actual'>): number {
  return group.gross - group.actual.income_tax - group.actual.local_income_tax - group.actual.employment_insurance;
}

export function totalNet(groups: PaymentDraftGroup[]): number {
  return groups.reduce((sum, g) => sum + netOf(g), 0);
}

/** 사람별 공제 오류(합계가 세전 초과 등). 오류가 없는 사람은 빠진다. */
export function draftErrors(groups: PaymentDraftGroup[]): Record<string, string> {
  return Object.fromEntries(groups.flatMap(g => {
    const problem = deductionError(g.gross, g.actual);
    return problem ? [[g.laborerId, problem]] : [];
  }));
}

/** 지급일 선택을 날짜로 바꾼다. '다른 날'인데 아직 고르지 않았거나 오늘 이후면 null. */
export function resolvePaidOn(choice: PayDayChoice, picked: string | null, today: string): string | null {
  if (choice === 'today') return today;
  if (choice === 'yesterday') return addDays(today, -1);
  return picked && isPayableDate(picked, today) ? picked : null;
}

/** 서비스로 보낼 묶음. 고치지 않은 사람은 예상값과 같은 값을 그대로 보낸다. */
export function toPaymentGroups(groups: PaymentDraftGroup[]): DailyLaborPaymentGroup[] {
  return groups.map(g => ({ laborerId: g.laborerId, entries: g.entries, deductions: g.actual }));
}
