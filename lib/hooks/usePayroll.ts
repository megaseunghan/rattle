import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getPayrollByMonth, upsertPayroll, deletePayroll, calculatePayroll } from '../services/payroll';
import { Employee, Payroll } from '../../types';

export function usePayroll(yearMonth: string) {
  const { store } = useAuth();
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState<string | null>(null); // employeeId
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getPayrollByMonth(store.id, yearMonth);
      setPayrolls(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [store, yearMonth]);

  const calculate = useCallback(async (employee: Employee) => {
    if (!store) throw new Error('매장 정보가 없습니다');
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

  const totalLaborCost = payrolls.reduce((sum, p) => sum + p.gross, 0);
  const totalNetPay = payrolls.reduce((sum, p) => sum + p.net_pay, 0);
  const totalInsurance = payrolls.reduce((sum, p) =>
    sum + p.national_pension + p.health_insurance + p.long_term_care + p.employment_insurance, 0);

  return {
    payrolls, loading, calculating, error,
    refetch, calculate, remove,
    totalLaborCost, totalNetPay, totalInsurance,
  };
}
