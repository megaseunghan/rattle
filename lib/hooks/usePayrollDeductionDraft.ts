import { useEffect, useState } from 'react';
import { Payroll } from '../../types';
import { PayrollDeductions } from '../services/payroll';

export const deductionKeys = ['national_pension', 'health_insurance', 'long_term_care',
  'employment_insurance', 'income_tax', 'local_income_tax', 'withholding_tax'] as const;
export function savedDeductions(payroll: Payroll): PayrollDeductions {
  return Object.fromEntries(deductionKeys.map(key => [key, payroll[key]])) as unknown as PayrollDeductions;
}
function signature(payroll: Payroll): string {
  return JSON.stringify([payroll.id, payroll.store_id, payroll.year_month, payroll.revision,
    payroll.gross, payroll.net_pay, payroll.is_settled, ...deductionKeys.map(key => payroll[key])]);
}
export type PayrollDeductionDraft = { baseline: Payroll; values: PayrollDeductions };
export function usePayrollDeductionDraft(payroll: Payroll | undefined, cache?: Map<string, PayrollDeductionDraft>, key = '') {
  const [draft, setDraft] = useState<PayrollDeductionDraft | null>(() => cache?.get(key) ?? null);
  useEffect(() => {
    if (draft) cache?.set(key, draft); else cache?.delete(key);
  }, [draft, cache, key]);
  // A temporary empty response during refresh must not erase an unsaved draft.
  const baseline = draft?.baseline ?? payroll;
  const values = draft?.values ?? (payroll ? savedDeductions(payroll) : Object.fromEntries(deductionKeys.map(key => [key, 0])) as unknown as PayrollDeductions);
  const dirty = !!draft && deductionKeys.some(key => draft.values[key] !== draft.baseline[key]);
  const changedOnServer = dirty && !!payroll && signature(payroll) !== signature(draft!.baseline);
  function update(key: keyof PayrollDeductions, value: number) {
    if (!baseline) return;
    setDraft(current => {
      const next = { baseline: current?.baseline ?? baseline, values: { ...(current?.values ?? values), [key]: value } };
      const changed = deductionKeys.some(field => next.values[field] !== next.baseline[field]);
      return changed ? next : null;
    });
  }
  return { values, dirty, changedOnServer, update, reset: () => setDraft(null) };
}
