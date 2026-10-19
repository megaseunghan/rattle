import { getErrorMessage, UserFacingError } from '../utils/error';
import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getPayrollByMonth,
  upsertPayroll,
  deletePayroll,
  calculatePayroll,
  updatePayrollDeductions,
  PayrollDeductions,
} from '../services/payroll';
import { Employee, Payroll } from '../../types';

export function usePayroll(yearMonth: string) {
  const { store } = useAuth();
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState<string | null>(null); // employeeId
  const [savingDeductions, setSavingDeductions] = useState<string | null>(null); // employeeId
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getPayrollByMonth(store.id, yearMonth);
      setPayrolls(result);
    } catch (e: any) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [store, yearMonth]);

  const calculate = useCallback(async (employee: Employee) => {
    if (!store) throw new UserFacingError('매장 정보가 없습니다');
    setCalculating(employee.id);
    try {
      const result = await calculatePayroll(employee);
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
    refetch, calculate, saveDeductions, remove,
    totalLaborCost, totalNetPay, totalInsurance,
  };
}
