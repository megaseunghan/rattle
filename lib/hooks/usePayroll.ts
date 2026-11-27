import { getErrorMessage, UserFacingError } from '../utils/error';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { queryClient, queryKeys, useQueryScope } from '../query';
import { STALE_TIME } from '../query/staleTimes';
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
import { probationDayFactor } from '../services/payroll';

type PayrollKey = readonly unknown[];

/**
 * 월 급여 명세(인건비 상세, 1분 재사용). active가 false면 자동으로 받지 않고 refetch로만 받는다.
 * 저장 결과는 캐시에 바로 반영하고, 저장 전에 시작한 조회는 취소해 새 금액을 덮지 못하게 한다.
 */
export function usePayroll(yearMonth: string, active = false) {
  const { store, user, access, canManageStore } = useAuth();
  const accessScope = useQueryScope();
  const storeId = store?.id;
  const key = useMemo<PayrollKey>(() => queryKeys.store(accessScope, storeId ?? '', 'payroll', yearMonth), [accessScope, storeId, yearMonth]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const [calculating, setCalculating] = useState<string | null>(null); // employeeId
  const [savingDeductions, setSavingDeductions] = useState<string | null>(null); // employeeId
  const deductionSave = useRef<PayrollKey | null>(null);
  useEffect(() => { setSavingDeductions(null); }, [key]);

  const query = useQuery({ queryKey: key, queryFn: () => getPayrollByMonth(storeId!, yearMonth),
    enabled: active && !!storeId, staleTime: STALE_TIME.moneyDetail }, queryClient);
  const { refetch: refetchQuery } = query;

  /** 당겨서 새로고침·다시 시도. 공제 저장 중에는 저장 결과를 기다린다. */
  const refetch = useCallback(async () => {
    if (!storeId || deductionSave.current === key) return;
    await refetchQuery();
  }, [storeId, key, refetchQuery]);

  /** 같은 화면 범위일 때만 저장 결과를 캐시에 반영한다. 저장 전에 시작한 조회는 취소한다. */
  const applySaved = useCallback(async (mutationKey: PayrollKey, change: (rows: Payroll[]) => Payroll[]) => {
    if (currentKey.current !== mutationKey) return;
    await queryClient.cancelQueries({ queryKey: mutationKey, exact: true });
    if (currentKey.current !== mutationKey) return;
    // 아직 받지 않은 월에 한 건만 넣으면 부분 합계가 확정값처럼 보인다. 그때는 서비스 무효화 재조회에 맡긴다.
    if (queryClient.getQueryData<Payroll[]>(mutationKey) === undefined) return;
    queryClient.setQueryData<Payroll[]>(mutationKey, previous => previous ? change(previous) : previous);
  }, []);

  const calculate = useCallback(async (employee: Employee) => {
    if (!store || !canManageStore || currentKey.current !== key) throw new UserFacingError('사장님이나 점장님에게 요청해주세요.');
    setCalculating(employee.id);
    try {
      // Recalculation is explicit; the stored timeline never follows later employee edits.
      const history = await getWageHistory(employee.id);
      if (currentKey.current !== key) throw new UserFacingError('선택한 매장과 권한을 다시 확인해주세요.');
      const snapshot = buildRegularWageSnapshot(employee, history, yearMonth, probationDayFactor(employee));
      const result = { ...await calculatePayroll({ ...employee, non_taxable: regularSnapshotNonTaxable(snapshot) }, undefined, yearMonth, regularSnapshotGross(snapshot)), regular_wage_snapshot: snapshot };
      if (currentKey.current !== key) throw new UserFacingError('선택한 매장과 권한을 다시 확인해주세요.');
      const saved = await upsertPayroll(store.id, employee.id, yearMonth, result);
      await applySaved(key, rows => [...rows.filter(p => p.employee_id !== employee.id), saved]);
      return saved;
    } finally {
      if (currentKey.current === key) setCalculating(null);
    }
  }, [store, yearMonth, key, canManageStore, applySaved]);

  const remove = useCallback(async (id: string) => {
    if (!canManageStore || currentKey.current !== key) throw new UserFacingError('사장님이나 점장님에게 요청해주세요.');
    await deletePayroll(id);
    await applySaved(key, rows => rows.filter(p => p.id !== id));
  }, [canManageStore, key, applySaved]);

  const saveWork = useCallback(async (employee: Employee, input: WorkedMinutesInput, previous?: Payroll) => {
    if (!access.is_owner && (employee.user_id === user?.id || employee.id === access.employee_id)) throw new UserFacingError('본인 근무시간은 사장님에게 요청해주세요.');
    if (!store || !canManageStore || currentKey.current !== key) throw new UserFacingError('사장님이나 점장님에게 요청해주세요.');
    setCalculating(employee.id);
    try {
      const saved = await saveWorkedMinutes(store.id, employee, yearMonth, input, previous);
      await applySaved(key, rows => [...rows.filter(row => row.employee_id !== employee.id), saved]);
      return saved;
    } finally {
      if (currentKey.current === key) setCalculating(null);
    }
  }, [store, yearMonth, key, canManageStore, access, user?.id, applySaved]);

  const saveDeductions = useCallback(async (payroll: Payroll, deductions: PayrollDeductions) => {
    if (!canManageStore || !store || payroll.store_id !== store.id || payroll.year_month !== yearMonth || currentKey.current !== key) {
      throw new UserFacingError('선택한 매장과 월의 급여를 다시 확인해주세요.');
    }
    if (deductionSave.current === key) throw new UserFacingError('공제 저장이 진행 중이에요.');
    deductionSave.current = key;
    setSavingDeductions(payroll.employee_id);
    try {
      const saved = await updatePayrollDeductions(payroll, deductions);
      // A pre-save read must not overwrite the committed result.
      await applySaved(key, rows => [...rows.filter(row => row.id !== saved.id), saved]);
      return saved;
    } finally {
      if (deductionSave.current === key) deductionSave.current = null;
      if (currentKey.current === key) setSavingDeductions(null);
    }
  }, [canManageStore, store?.id, yearMonth, key, applySaved]);

  // 아직 받지 못한 월은 합계를 0원이 아니라 null(미확인)로 둔다.
  const payrolls = storeId ? query.data : undefined;
  const visiblePayrolls = payrolls ?? [];
  const sum = (pick: (p: Payroll) => number) => payrolls ? payrolls.reduce((total, p) => total + pick(p), 0) : null;

  return {
    payrolls: visiblePayrolls, loading: !!storeId && query.isFetching && query.data === undefined, calculating, savingDeductions,
    error: storeId && query.isError ? getErrorMessage(query.error) : null,
    refetch, calculate, saveWork, saveDeductions, remove,
    totalLaborCost: sum(p => p.gross),
    totalNetPay: sum(p => p.net_pay),
    totalInsurance: sum(p => p.national_pension + p.health_insurance + p.long_term_care + p.employment_insurance),
  };
}
