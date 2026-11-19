import { getErrorMessage, UserFacingError } from '../utils/error';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getPayrollByMonth,
  upsertPayroll,
  deletePayroll,
  calculatePayroll,
  updatePayrollDeductions,
  PayrollDeductions,
  saveWorkedMinutes,
  WorkedMinutesInput,
} from '../services/payroll';
import { Employee, Payroll } from '../../types';
import { getWageHistory } from '../services/wageHistory';
import { buildRegularWageSnapshot, regularSnapshotGross, regularSnapshotNonTaxable } from '../utils/regularWages';
import { probationFactor } from '../services/payroll';

export function usePayroll(yearMonth: string) {
  const { store, user, currentRole, access, canManageStore, permissionRevision } = useAuth();
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState<string | null>(null); // employeeId
  const [savingDeductions, setSavingDeductions] = useState<string | null>(null); // employeeId
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const scope = useMemo(() => ({}), [user?.id, permissionRevision, currentRole, store?.id, yearMonth]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const deductionSave = useRef<object | null>(null);
  const readScope = useRef(scope);
  useEffect(() => {
    setSavingDeductions(null);
    return () => { requestId.current += 1; };
  }, [scope]);

  const refetch = useCallback(async () => {
    if (currentScope.current !== scope || deductionSave.current === scope) return;
    const id = ++requestId.current;
    // Keep the full same-scope snapshot while a read overlaps a deduction save.
    if (readScope.current !== scope) {
      readScope.current = scope;
      setPayrolls([]);
    }
    if (!store) { setPayrolls([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await getPayrollByMonth(store.id, yearMonth);
      if (id === requestId.current) setPayrolls(result);
    } catch (e: any) {
      if (id === requestId.current) setError(getErrorMessage(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [store, yearMonth, scope]);

  const calculate = useCallback(async (employee: Employee) => {
    if (!store || !canManageStore || currentScope.current !== scope) throw new UserFacingError('사장님이나 점장님에게 요청해주세요.');
    setCalculating(employee.id);
    try {
      // Recalculation is explicit; the stored timeline never follows later employee edits.
      const history = await getWageHistory(employee.id);
      if (currentScope.current !== scope) throw new UserFacingError('선택한 매장과 권한을 다시 확인해주세요.');
      const snapshot = buildRegularWageSnapshot(employee, history, yearMonth, probationFactor(employee));
      const result = { ...await calculatePayroll({ ...employee, non_taxable: regularSnapshotNonTaxable(snapshot) }, undefined, yearMonth, regularSnapshotGross(snapshot)), regular_wage_snapshot: snapshot };
      if (currentScope.current !== scope) throw new UserFacingError('선택한 매장과 권한을 다시 확인해주세요.');
      const saved = await upsertPayroll(store.id, employee.id, yearMonth, result);
      if (currentScope.current === scope) setPayrolls(prev => {
        const exists = prev.findIndex(p => p.employee_id === employee.id);
        return exists >= 0
          ? prev.map((p, i) => i === exists ? saved : p)
          : [...prev, saved];
      });
      return saved;
    } finally {
      if (currentScope.current === scope) setCalculating(null);
    }
  }, [store, yearMonth, scope, canManageStore, access, user?.id]);

  const remove = useCallback(async (id: string) => {
    if (!canManageStore || currentScope.current !== scope) throw new UserFacingError('사장님이나 점장님에게 요청해주세요.');
    await deletePayroll(id);
    if (currentScope.current === scope) setPayrolls(prev => prev.filter(p => p.id !== id));
  }, [canManageStore, scope]);

  const saveWork = useCallback(async (employee: Employee, input: WorkedMinutesInput, previous?: Payroll) => {
    if (!access.is_owner && (employee.user_id === user?.id || employee.id === access.employee_id)) throw new UserFacingError('본인 근무시간은 사장님에게 요청해주세요.');
    if (!store || !canManageStore || currentScope.current !== scope) throw new UserFacingError('사장님이나 점장님에게 요청해주세요.');
    setCalculating(employee.id);
    try {
      const saved = await saveWorkedMinutes(store.id, employee, yearMonth, input, previous);
      if (currentScope.current === scope) setPayrolls(prev => [...prev.filter(row => row.employee_id !== employee.id), saved]);
      return saved;
    } finally {
      if (currentScope.current === scope) setCalculating(null);
    }
  }, [store, yearMonth, scope, canManageStore, access, user?.id]);

  const saveDeductions = useCallback(async (payroll: Payroll, deductions: PayrollDeductions) => {
    if (!canManageStore || !store || payroll.store_id !== store.id || payroll.year_month !== yearMonth || currentScope.current !== scope) {
      throw new UserFacingError('선택한 매장과 월의 급여를 다시 확인해주세요.');
    }
    if (deductionSave.current === scope) throw new UserFacingError('공제 저장이 진행 중이에요.');
    deductionSave.current = scope;
    setSavingDeductions(payroll.employee_id);
    try {
      const saved = await updatePayrollDeductions(payroll, deductions);
      if (currentScope.current === scope) {
        requestId.current += 1; // A pre-save read must not overwrite the committed result.
        setLoading(false);
        setPayrolls(prev => [...prev.filter(row => row.id !== saved.id), saved]);
      }
      return saved;
    } finally {
      if (deductionSave.current === scope) deductionSave.current = null;
      if (currentScope.current === scope) setSavingDeductions(null);
    }
  }, [canManageStore, store?.id, yearMonth, scope]);

  const visiblePayrolls = readScope.current === scope ? payrolls : [];
  const totalLaborCost = visiblePayrolls.reduce((sum, p) => sum + p.gross, 0);
  const totalNetPay = visiblePayrolls.reduce((sum, p) => sum + p.net_pay, 0);
  const totalInsurance = visiblePayrolls.reduce((sum, p) =>
    sum + p.national_pension + p.health_insurance + p.long_term_care + p.employment_insurance, 0);

  return {
    payrolls: visiblePayrolls, loading, calculating, savingDeductions, error,
    refetch, calculate, saveWork, saveDeductions, remove,
    totalLaborCost: readScope.current === scope ? totalLaborCost : null,
    totalNetPay: readScope.current === scope ? totalNetPay : null,
    totalInsurance: readScope.current === scope ? totalInsurance : null,
  };
}
