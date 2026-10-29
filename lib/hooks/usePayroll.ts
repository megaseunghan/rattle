import { getErrorMessage, UserFacingError } from '../utils/error';
import { useState, useCallback, useRef, useEffect } from 'react';
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
  const { store } = useAuth();
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState<string | null>(null); // employeeId
  const [savingDeductions, setSavingDeductions] = useState<string | null>(null); // employeeId
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  useEffect(() => () => { requestId.current += 1; }, [store?.id, yearMonth]);

  const refetch = useCallback(async () => {
    const id = ++requestId.current;
    setPayrolls([]);
    if (!store) { setLoading(false); return; }
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
  }, [store, yearMonth]);

  const calculate = useCallback(async (employee: Employee) => {
    if (!store) throw new UserFacingError('매장 정보가 없습니다');
    setCalculating(employee.id);
    try {
      // Recalculation is explicit; the stored timeline never follows later employee edits.
      const history = await getWageHistory(employee.id);
      const snapshot = buildRegularWageSnapshot(employee, history, yearMonth, probationFactor(employee));
      const result = { ...await calculatePayroll({ ...employee, non_taxable: regularSnapshotNonTaxable(snapshot) }, undefined, yearMonth, regularSnapshotGross(snapshot)), regular_wage_snapshot: snapshot };
      const saved = await upsertPayroll(store.id, employee.id, yearMonth, result);
      setPayrolls(prev => {
        const exists = prev.findIndex(p => p.employee_id === employee.id);
        return exists >= 0
          ? prev.map((p, i) => i === exists ? saved : p)
          : [...prev, saved];
      });
      return saved;
    } finally {
      setCalculating(null);
    }
  }, [store, yearMonth]);

  const remove = useCallback(async (id: string) => {
    await deletePayroll(id);
    setPayrolls(prev => prev.filter(p => p.id !== id));
  }, []);

  const saveWork = useCallback(async (employee: Employee, input: WorkedMinutesInput, previous?: Payroll) => {
    if (!store) throw new UserFacingError('매장 정보가 없습니다');
    setCalculating(employee.id);
    try {
      const saved = await saveWorkedMinutes(store.id, employee, yearMonth, input, previous);
      setPayrolls(prev => [...prev.filter(row => row.employee_id !== employee.id), saved]);
      return saved;
    } finally {
      setCalculating(null);
    }
  }, [store, yearMonth]);

  const saveDeductions = useCallback(async (payroll: Payroll, deductions: PayrollDeductions) => {
    setSavingDeductions(payroll.employee_id);
    try {
      const saved = await updatePayrollDeductions(payroll, deductions);
      setPayrolls(prev => prev.map(row => row.id === saved.id ? saved : row));
      return saved;
    } finally {
      setSavingDeductions(null);
    }
  }, []);

  const totalLaborCost = payrolls.reduce((sum, p) => sum + p.gross, 0);
  const totalNetPay = payrolls.reduce((sum, p) => sum + p.net_pay, 0);
  const totalInsurance = payrolls.reduce((sum, p) =>
    sum + p.national_pension + p.health_insurance + p.long_term_care + p.employment_insurance, 0);

  return {
    payrolls, loading, calculating, savingDeductions, error,
    refetch, calculate, saveWork, saveDeductions, remove,
    totalLaborCost, totalNetPay, totalInsurance,
  };
}
