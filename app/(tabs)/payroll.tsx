import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { SheetModal } from '../../lib/components/ui/SheetModal';
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md · designed-as-app */
import { getErrorMessage } from '../../lib/utils/error';
import { useState, useCallback, useEffect, useRef, useContext, useMemo } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { CardStyle } from '../../constants/designTokens';
import { Fonts } from '../../constants/fonts';
import { useAuth } from '../../lib/contexts/AuthContext';
import { TabPagerContext } from '../../lib/contexts/TabPagerContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { usePayroll } from '../../lib/hooks/usePayroll';
import { Employee, EmploymentType } from '../../types';
import { isInProbation, isInsuranceApplicable } from '../../lib/services/employees';
import { PayrollSubmissionReview } from '../../lib/components/PayrollSubmissionReview';
import { PayrollWorkSubmission } from '../../types';
import { WorkMinutesForm } from '../../lib/components/WorkMinutesForm';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { formatWorkedMinutes } from '../../lib/utils/workMinutes';
import { getPayrollSettlementGaps, PayrollDeductions, probationFactor } from '../../lib/services/payroll';
import {
  getStoreWageHistory,
} from '../../lib/services/wageHistory';
import { isWageDate } from '../../lib/utils/wageCondition';
import { accruedRegularPayroll, regularEmployeesForAccrual } from '../../lib/utils/regularWages';
import { WageHistory } from '../../types';
import { animateListChange } from '../../lib/utils/layoutAnimation';
import { Badge, EmptyState, Field } from '../../lib/components/ui';


/** 경과일 기준 일할 계수 (라벨 표기용): 지난 달 1, 다음 달 0, 진행 중인 달은 경과일/총일수 */
function accruedFactor(year: number, month: number): number {
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  if (year > cy || (year === cy && month > cm)) return 0;
  if (year < cy || (year === cy && month < cm)) return 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  return Math.min(1, now.getDate() / daysInMonth);
}

function toYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

type DeductionDraft = Record<keyof PayrollDeductions, string>;

function moneyInput(value: number): string {
  return value > 0 ? value.toLocaleString() : '';
}

function parseMoneyInput(value: string): number {
  return Number(value.replace(/[^0-9]/g, '')) || 0;
}

function DeductionInputLine({
  label,
  value,
  editable,
  onChange,
}: {
  label: string;
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.receiptRow}>
      <Text style={styles.receiptLabel}>{label}</Text>
      <View style={[styles.deductionInputWrap, !editable && styles.deductionInputWrapDisabled]}>
        <Text style={styles.deductionMinus}>−</Text>
        <TextInput
          value={value}
          onChangeText={text => onChange(moneyInput(parseMoneyInput(text)))}
          editable={editable}
          keyboardType="number-pad"
          selectTextOnFocus
          placeholder="0"
          placeholderTextColor={Colors.gray300}
          style={styles.deductionInput}
        />
        <Text style={styles.deductionWon}>원</Text>
      </View>
    </View>
  );
}

function EmployeeCard({
  employee,
  payroll,
  accruedGross,
  accrualLabel,
  onShowHistory,
  isCalculating,
  onCalculate,
  onSaveDeductions,
  isSavingDeductions,
  canEditDeductions,
  onEdit,
  onWageCondition,
  canCalculate,
  onWorkMinutes,
  onRemovePayroll,
}: {
  employee: Employee;
  payroll: ReturnType<typeof usePayroll>['payrolls'][0] | undefined;
  accruedGross: number | null;
  accrualLabel: string;
  onShowHistory: () => void;
  isCalculating: boolean;
  onCalculate: () => void;
  canCalculate: boolean;
  onSaveDeductions: (deductions: PayrollDeductions) => Promise<void>;
  isSavingDeductions: boolean;
  canEditDeductions: boolean;
  onEdit?: () => void;
  onWageCondition?: () => void;
  onWorkMinutes?: () => void;
  onRemovePayroll?: () => void;
}) {
  const probation = isInProbation(employee);
  const insurance = isInsuranceApplicable(employee);
  const isPart = employee.employment_type === 'part_time';
  const [expanded, setExpanded] = useState(false);
  const [deductionDraft, setDeductionDraft] = useState<DeductionDraft>({
    national_pension: '',
    health_insurance: '',
    long_term_care: '',
    employment_insurance: '',
    income_tax: '',
    local_income_tax: '',
    withholding_tax: '',
  });

  useEffect(() => {
    if (!payroll) return;
    setDeductionDraft({
      national_pension: moneyInput(payroll.national_pension),
      health_insurance: moneyInput(payroll.health_insurance),
      long_term_care: moneyInput(payroll.long_term_care),
      employment_insurance: moneyInput(payroll.employment_insurance),
      income_tax: moneyInput(payroll.income_tax),
      local_income_tax: moneyInput(payroll.local_income_tax),
      withholding_tax: moneyInput(payroll.withholding_tax),
    });
  }, [
    payroll?.id,
    payroll?.national_pension,
    payroll?.health_insurance,
    payroll?.long_term_care,
    payroll?.employment_insurance,
    payroll?.income_tax,
    payroll?.local_income_tax,
    payroll?.withholding_tax,
  ]);

  function toggleExpanded() {
    animateListChange();
    setExpanded(v => !v);
  }

  const baseLabel = isPart ? '시급' : '기본급';
  const baseValue = isPart
    ? (employee.hourly_wage != null ? `${Number(employee.hourly_wage).toLocaleString()}원` : '—')
    : `${employee.base_salary.toLocaleString()}원`;
  const summaryNetPay = payroll ? payroll.net_pay : null;
  const summaryNetLabel = payroll?.is_settled ? '확정 실수령액' : '월 예상 지급액';
  const deductions = Object.fromEntries(
    Object.entries(deductionDraft).map(([key, value]) => [key, parseMoneyInput(value)]),
  ) as unknown as PayrollDeductions;
  const deductionTotal = Object.values(deductions).reduce((sum, value) => sum + value, 0);
  const previewNetPay = payroll ? Math.max(0, payroll.gross - deductionTotal) : 0;
  const deductionsInvalid = payroll ? deductionTotal > payroll.gross : false;

  function updateDeduction(key: keyof PayrollDeductions, value: string) {
    setDeductionDraft(current => ({ ...current, [key]: value }));
  }

  return (
    <View style={styles.employeeCard}>
      <View style={styles.cardHeader}>
        <View style={styles.cardNameRow}>
          <Text style={styles.employeeName}>{employee.name}</Text>
          <Badge
            label={employee.employment_type === 'regular' ? '정규직' : '파트타임'}
            variant={employee.employment_type === 'regular' ? 'employment' : 'neutral'}
          />
          {probation && (
            <View style={styles.probationBadge}>
              <Text style={styles.probationBadgeText}>수습 · {Math.round(probationFactor(employee) * 100)}%</Text>
            </View>
          )}
          {!insurance && <Badge label="3.3%" variant="neutral" />}
          {payroll?.work_source === 'legacy_attendance' && <Badge label="이전 내역 · 공제 확인" variant="neutral" />}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={onShowHistory} style={styles.histBtn} accessibilityRole="button" accessibilityLabel="급여 조건 이력">
            <Ionicons name="time-outline" size={16} color={Colors.gray400} />
          </TouchableOpacity>
          {onEdit && <TouchableOpacity onPress={onEdit} style={styles.editBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="직원 정보 수정">
            <Ionicons name="create-outline" size={16} color={Colors.gray500} />
          </TouchableOpacity>}
        </View>
      </View>

      {onWageCondition && <TouchableOpacity onPress={onWageCondition} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 10, backgroundColor: Colors.white }} accessibilityRole="button"><Text style={{ color: Colors.action, fontWeight: '600' }}>급여 변경 →</Text></TouchableOpacity>}
      <TouchableOpacity style={styles.salaryRow} onPress={toggleExpanded} activeOpacity={0.7}>
        <View>
          <Text style={styles.salaryLabel}>{baseLabel}</Text>
          <Text style={styles.salaryValue}>{baseValue}</Text>
        </View>
        <View style={styles.summaryRight}>
          {summaryNetPay != null && (
            <View>
              <Text style={styles.summaryNetLabel}>{summaryNetLabel}</Text>
              <Text style={styles.summaryNetValue}>{summaryNetPay.toLocaleString()}원</Text>
            </View>
          )}
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.gray400} />
        </View>
      </TouchableOpacity>

      {isPart && <View style={styles.payrollRow}>
        <Text style={styles.payrollLabel}>급여 작성 근무</Text>
        <Text style={styles.payrollDeduct}>{formatWorkedMinutes(payroll?.worked_minutes)}</Text>
      </View>}
      {isPart && onWorkMinutes && <TouchableOpacity style={styles.recalcBtn} onPress={onWorkMinutes} disabled={isCalculating}>
        <Text style={[styles.recalcBtnText, payroll?.worked_minutes == null && styles.recalcBtnNeeded]}>
          {payroll?.worked_minutes == null ? '근무시간 입력 →' : '근무시간 수정 · 이력'}
        </Text>
      </TouchableOpacity>}
      {expanded && (
      <>
      <View style={styles.payrollDivider} />
      <View style={styles.payrollRow}>
        <Text style={styles.payrollLabel}>세전 누적액</Text>
        <Text style={styles.payrollNetPay}>{(isPart ? payroll?.gross : accruedGross) == null ? '확인 필요' : `${(isPart ? payroll!.gross : accruedGross!).toLocaleString()}원`}</Text>
      </View>
      <View style={styles.payrollRow}>
        <Text style={styles.payrollDeductLabel}>{isPart ? '근무시간 기준' : '일할 기준'}</Text>
        <Text style={styles.payrollDeduct}>{isPart ? formatWorkedMinutes(payroll?.worked_minutes) : accrualLabel}</Text>
      </View>

      {payroll ? (
        <View style={styles.payrollResult}>
          <View style={styles.receiptDivider} />
          <View style={styles.receiptHeadingRow}>
            <Text style={styles.receiptHeading}>공제 내역 직접 입력</Text>
            <Badge label={payroll.is_settled ? '정산완료' : '검토 필요'} variant={payroll.is_settled ? 'positive' : 'neutral'} />
          </View>
          <View style={styles.payrollRow}>
            <Text style={styles.payrollDeductLabel}>월 급여 기준액</Text>
            <Text style={styles.payrollDeduct}>{payroll.gross.toLocaleString()}원</Text>
          </View>
          <Text style={styles.deductionHint}>자동 계산값이 채워져 있어요. 급여 지급 전 실제 고지액으로 수정해주세요.</Text>
          {insurance ? (
            <>
              <DeductionInputLine label="국민연금" value={deductionDraft.national_pension} editable={canEditDeductions && !isSavingDeductions} onChange={value => updateDeduction('national_pension', value)} />
              <DeductionInputLine label="건강보험" value={deductionDraft.health_insurance} editable={canEditDeductions && !isSavingDeductions} onChange={value => updateDeduction('health_insurance', value)} />
              <DeductionInputLine label="장기요양" value={deductionDraft.long_term_care} editable={canEditDeductions && !isSavingDeductions} onChange={value => updateDeduction('long_term_care', value)} />
              <DeductionInputLine label="고용보험" value={deductionDraft.employment_insurance} editable={canEditDeductions && !isSavingDeductions} onChange={value => updateDeduction('employment_insurance', value)} />
              <DeductionInputLine label="소득세" value={deductionDraft.income_tax} editable={canEditDeductions && !isSavingDeductions} onChange={value => updateDeduction('income_tax', value)} />
              <DeductionInputLine label="지방소득세" value={deductionDraft.local_income_tax} editable={canEditDeductions && !isSavingDeductions} onChange={value => updateDeduction('local_income_tax', value)} />
            </>
          ) : (
            <DeductionInputLine label="3.3% 원천징수" value={deductionDraft.withholding_tax} editable={canEditDeductions && !isSavingDeductions} onChange={value => updateDeduction('withholding_tax', value)} />
          )}
          {deductionsInvalid && <Text style={styles.deductionError}>공제 합계가 세전 급여보다 큽니다.</Text>}
          <View style={styles.receiptTotalLine} />
          <View style={styles.receiptNetRow}>
            <Text style={styles.receiptNetLabel}>{payroll.is_settled ? '확정 실수령액' : '예상 실수령액'}</Text>
            <Text style={styles.receiptNetValue}>{previewNetPay.toLocaleString()}원</Text>
          </View>
          <View style={styles.payrollActions}>
            {canCalculate && <TouchableOpacity style={styles.recalcBtn} onPress={onCalculate} disabled={isCalculating}>
              {isCalculating
                ? <ActivityIndicator size="small" color={Colors.gray500} />
                : <Text style={styles.recalcBtnText}>자동 계산값 다시 불러오기</Text>
              }
            </TouchableOpacity>}
            {canEditDeductions && (
              <TouchableOpacity
                style={[styles.saveDeductionBtn, (isSavingDeductions || deductionsInvalid) && styles.saveDeductionBtnDisabled]}
                onPress={() => onSaveDeductions(deductions)}
                disabled={isSavingDeductions || deductionsInvalid}
                activeOpacity={0.8}
              >
                {isSavingDeductions
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Text style={styles.saveDeductionBtnText}>공제 내역 저장</Text>}
              </TouchableOpacity>
            )}
          </View>
          {onRemovePayroll && (
            <View style={styles.removePayrollRow}>
              <TouchableOpacity style={styles.removePayrollBtn} onPress={onRemovePayroll}>
                <Text style={styles.removePayrollBtnText}>삭제</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : canCalculate ? (
        <TouchableOpacity
          style={[styles.calcBtn, isCalculating && { opacity: 0.5 }]}
          onPress={onCalculate}
          disabled={isCalculating}
        >
          {isCalculating
            ? <ActivityIndicator size="small" color={Colors.white} />
            : <><Ionicons name="calculator-outline" size={14} color={Colors.white} /><Text style={styles.calcBtnText}>급여 계산</Text></>
          }
        </TouchableOpacity>
      ) : null}
      </>
      )}
    </View>
  );
}

const EMPTY_FORM = {
  name: '',
  employment_type: 'regular' as EmploymentType,
  base_salary: '',
  hourly_wage: '',
  non_taxable: '',
  joined_at: '',
  phone: '',
  bank_name: '',
  account_number: '',
  weekly_hours: '',
  dependents: '1',
  user_id: null as string | null,
};

export function PayrollScreen({ active = true }: { active?: boolean }) {
  const today = new Date();
  const pager = useContext(TabPagerContext);
  const [localMonth, setLocalMonth] = useState(toYearMonth(today.getFullYear(), today.getMonth() + 1));
  const yearMonth = pager?.selectedMonth ?? localMonth;
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  const setYearMonth = pager?.setSelectedMonth ?? setLocalMonth;
  const { employees: allEmployees, loading: empLoading, error: employeeError, refetch: refetchEmp, add, update, deactivate } = useEmployees(true);
  const employees = useMemo(() => allEmployees.filter(employee => employee.is_active !== false), [allEmployees]);
  const {
    payrolls,
    loading: payLoading,
    calculating,
    savingDeductions,
    refetch: refetchPay,
    calculate,
    saveWork,
    error: payrollError,
    saveDeductions,
    remove: removePayroll,
  } = usePayroll(yearMonth);

  const { store, currentRole } = useAuth();
  const isAdmin = currentRole === 'admin';
  const workScope = `${store?.id}:${yearMonth}`;
  const workScopeRef = useRef(workScope);
  workScopeRef.current = workScope;
  useEffect(() => () => { workScopeRef.current = ''; }, []);
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [workTarget, setWorkTarget] = useState<Employee | null>(null);
  const [workSubmission, setWorkSubmission] = useState<PayrollWorkSubmission | undefined>();
  useEffect(() => { setWorkTarget(null); setWorkSubmission(undefined); }, [workScope]);
  const [histMap, setHistMap] = useState<Record<string, WageHistory[]>>({});
  const [histLoading, setHistLoading] = useState(true);
  const [histError, setHistError] = useState(false);
  const historyRequest = useRef(0);

  // 급여 이력 보기 모달
  const [histTarget, setHistTarget] = useState<Employee | null>(null);
  useEffect(() => { setHistTarget(null); setModalVisible(false); }, [store?.id]);

  const refetchHist = useCallback(async () => {
    const request = ++historyRequest.current;
    if (!store) { setHistMap({}); setHistLoading(false); return; }
    setHistLoading(true); setHistError(false); setHistMap({});
    try {
      const rows = await getStoreWageHistory(store.id);
      if (request !== historyRequest.current) return;
      const map: Record<string, WageHistory[]> = {};
      for (const row of rows) (map[row.employee_id] ??= []).push(row);
      setHistMap(map);
    } catch { if (request === historyRequest.current) setHistError(true); }
    finally { if (request === historyRequest.current) setHistLoading(false); }
  }, [store?.id]);
  useEffect(() => () => { historyRequest.current += 1; }, []);

  useFocusEffect(useCallback(() => {
    if (!active) return;
    void refetchEmp(true);
    void refetchPay();
    void refetchHist();
  }, [active, refetchEmp, refetchPay, refetchHist]));

  const [refreshing, setRefreshing] = useState(false);
  async function onRefresh() {
    setRefreshing(true);
    try { await Promise.all([refetchEmp(), refetchPay(), refetchHist()]); }
    finally { setRefreshing(false); }
  }

  function prevMonth() { const date = new Date(year, month - 2, 1); setYearMonth(toYearMonth(date.getFullYear(), date.getMonth() + 1)); }
  function nextMonth() { const date = new Date(year, month, 1); setYearMonth(toYearMonth(date.getFullYear(), date.getMonth() + 1)); }

  function openAdd() {
    if (!isAdmin) return;
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }

  useEffect(() => {
    if (!active || !isAdmin || !pager?.employeeRegistration || pager.employeeRegistration.storeId !== store?.id) return;
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
    pager.consumeEmployeeRegistration?.();
  }, [active, isAdmin, store?.id, pager?.employeeRegistration, pager?.consumeEmployeeRegistration]);

  function openEdit(employee: Employee) {
    if (!isAdmin) {
      Alert.alert('수정 권한 없음', '직원 정보는 관리자만 수정할 수 있어요.');
      return;
    }
    setEditTarget(employee);
    setForm({
      name: employee.name,
      employment_type: employee.employment_type,
      base_salary: String(employee.base_salary),
      hourly_wage: employee.hourly_wage != null ? String(employee.hourly_wage) : '',
      non_taxable: String(employee.non_taxable),
      joined_at: employee.joined_at ?? '',
      phone: employee.phone ?? '',
      bank_name: employee.bank_name ?? '',
      account_number: employee.account_number ?? '',
      weekly_hours: employee.weekly_hours != null ? String(employee.weekly_hours) : '',
      dependents: String(employee.dependents),
      user_id: employee.user_id,
    });
    setModalVisible(true);
  }

  async function handleSave() {
    const name = form.name.trim();
    const isPart = form.employment_type === 'part_time';
    const wh = form.weekly_hours ? Number(form.weekly_hours) : null;
    // 비과세·부양가족은 정규직 또는 주15h 이상 파트타이머에만 적용
    const useInsuranceFields = !isPart || (wh != null && wh >= 15);

    const salary = Number(form.base_salary.replace(/,/g, '') || '0');
    const hourly = Number(form.hourly_wage.replace(/,/g, '') || '0');
    const nonTaxable = useInsuranceFields ? Number(form.non_taxable.replace(/,/g, '') || '0') : 0;
    const dep = useInsuranceFields ? Number(form.dependents || '1') : 1;

    if (editTarget && form.employment_type !== editTarget.employment_type) { Alert.alert('고용 형태 확인', '이 화면에서는 고용 형태를 변경할 수 없어요. 기존 정보를 유지한 뒤 관리자에게 급여 조건 전환을 요청해 주세요.'); return; }
    if (!name) { Alert.alert('입력 오류', '이름을 입력해주세요.'); return; }
    if ((!editTarget || form.joined_at.trim()) && !isWageDate(form.joined_at.trim())) { Alert.alert('입사일 확인', '최초 급여를 적용할 입사일을 YYYY-MM-DD 형식으로 입력해 주세요.'); return; }
    if (!editTarget && isPart) {
      if (!hourly || hourly <= 0) { Alert.alert('입력 오류', '시급을 입력해주세요.'); return; }
    } else if (!editTarget) {
      if (!salary || salary <= 0) { Alert.alert('입력 오류', '기본급을 입력해주세요.'); return; }
    }

    const newBase = isPart ? 0 : salary;
    const newHourly = isPart ? hourly : null;

    // 급여 외 정보 (이력과 무관 — 즉시 반영)
    const basePayload = {
      name,
      employment_type: form.employment_type,
      joined_at: form.joined_at.trim() || null,
      phone: form.phone.trim() || null,
      bank_name: form.bank_name.trim() || null,
      account_number: form.account_number.trim() || null,
      weekly_hours: isPart ? wh : null,
      dependents: dep,
    };

    setSaving(true);
    try {
      if (editTarget) {
        await update(editTarget.id, basePayload);
        setModalVisible(false);
      } else {
        await add({ ...basePayload, base_salary: newBase, hourly_wage: newHourly, non_taxable: nonTaxable });
        setModalVisible(false);
      }
    } catch (e: any) {
      Alert.alert('저장 실패', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  // 정규직은 기존 일할 계산, 파트타이머는 월별 작성 급여 기준
  const accrualNow = new Date();
  const monthPayrolls = useMemo(() => payrolls.filter(p => p.year_month === yearMonth && p.store_id === store?.id), [payrolls, yearMonth, store?.id]);
  const partTimePayrolls = monthPayrolls.filter(p => p.applied_hourly_wage != null || p.daily_work_snapshot != null || allEmployees.some(e => e.id === p.employee_id && e.employment_type === 'part_time') || p.work_source === 'legacy_attendance');
  const partTimeWageTotal = partTimePayrolls.reduce((s, p) => s + Number(p.gross), 0);
  const { missingPayroll, missingPartTimeMinutes } = getPayrollSettlementGaps(employees, monthPayrolls);
  const regularEmps = regularEmployeesForAccrual(employees, partTimePayrolls);
  function accruedForEmployee(employee: Employee): number | null {
    const payroll = monthPayrolls.find(row => row.employee_id === employee.id);
    if (employee.employment_type === 'part_time' || partTimePayrolls.some(p => p.employee_id === employee.id)) return payroll ? Number(payroll.gross) : null;
    if (histLoading || histError) return null;
    try { return accruedRegularPayroll(employee, histMap[employee.id] ?? [], payroll, yearMonth, accrualNow, probationFactor(employee)); }
    catch { return null; }
  }
  const savedRegularPayrolls = monthPayrolls.filter(row => !partTimePayrolls.includes(row));
  const regularAccruals = [
    ...regularEmps.map(accruedForEmployee),
    ...savedRegularPayrolls.filter(row => !regularEmps.some(employee => employee.id === row.employee_id)).map(row => {
      const employee = allEmployees.find(value => value.id === row.employee_id);
      try { return accruedRegularPayroll(employee, employee ? histMap[employee.id] ?? [] : [], row, yearMonth, accrualNow, employee ? probationFactor(employee) : 1); }
      catch { return null; }
    }),
  ];
  const invalidWageData = regularAccruals.some(value => value == null || !Number.isFinite(value));
  const regularAccruedGross = regularAccruals.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const regularExpectedNet = savedRegularPayrolls.reduce((sum, row) => sum + Number(row.net_pay), 0);
  const totalLaborCost = regularAccruedGross + partTimeWageTotal;
  const totalExpectedPay = regularExpectedNet + partTimePayrolls.reduce((s, p) => s + Number(p.net_pay), 0);
  const monthLabel = `${year}년 ${month}월`;

  const canSaveEmployee = form.name.trim().length > 0 && (!!editTarget || (
    form.employment_type === 'part_time'
      ? Number(form.hourly_wage.replace(/,/g, '') || '0') > 0
      : Number(form.base_salary.replace(/,/g, '') || '0') > 0
  ));

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}><GlassBackdrop />
      <View style={styles.topBar}>
        <Text style={styles.title}>{isAdmin ? '직원관리' : '내 급여'}</Text>
        <View style={styles.topBarRight}>
          {isAdmin && (
            <TouchableOpacity
              style={styles.settlementBtn}
              onPress={() => router.push({ pathname: '/payroll/settlement', params: { yearMonth } })}
              activeOpacity={0.7}
            >
              <Ionicons name="document-text-outline" size={14} color={Colors.primary} />
              <Text style={styles.settlementBtnText}>정산 리포트</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.monthPill}>{monthLabel}</Text>
        </View>
      </View>

      {workTarget && store && <WorkMinutesForm
        key={`${store.id}:${workTarget.id}:${yearMonth}`}
        storeId={store.id} employee={workTarget} yearMonth={yearMonth}
        payroll={monthPayrolls.find(p => p.employee_id === workTarget.id)}
        submission={workSubmission} onDailyApplied={refetchPay} onClose={() => { setWorkTarget(null); setWorkSubmission(undefined); }} onSave={(input, previous) => saveWork(workTarget, input, previous)}
      />}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >

        {/* 월 네비게이션 */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={prevMonth} style={styles.navBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="이전 달">
            <Ionicons name="chevron-back" size={20} color={Colors.gray600} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <TouchableOpacity onPress={nextMonth} style={styles.navBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="다음 달">
            <Ionicons name="chevron-forward" size={20} color={Colors.gray600} />
          </TouchableOpacity>
        </View>

        {!empLoading && !payLoading && (missingPayroll.length > 0 || missingPartTimeMinutes.length > 0) && (
          <View style={styles.workWarning}>
            {missingPayroll.length > 0 && <Text style={styles.workWarningTitle}>급여 미작성 {missingPayroll.length}명</Text>}
            {missingPartTimeMinutes.length > 0 && <Text style={styles.workWarningTitle}>파트타이머 근무시간 미입력 {missingPartTimeMinutes.length}명</Text>}
            <Text style={styles.workWarningBody}>정규직은 급여를 계산하고, 파트타이머는 총 근무 분을 입력해 주세요. 0분도 입력한 값으로 인정해요.</Text>
          </View>
        )}

        {/* 요약 카드 */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>총 인건비</Text>
            {(payLoading || empLoading || histLoading)
              ? <ActivityIndicator size="small" color={Colors.gray300} style={styles.summaryLoader} />
              : <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{histError || employeeError || payrollError ? '조회 실패' : invalidWageData ? '직원 정보 확인' : `${totalLaborCost.toLocaleString()}원`}</Text>
            }
            <Text style={styles.summarySub}>오늘까지 세전 누적 · 일할</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>작성된 급여 지급액</Text>
            {payLoading
              ? <ActivityIndicator size="small" color={Colors.gray300} style={styles.summaryLoader} />
              : <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{employeeError || payrollError ? '조회 실패' : `${totalExpectedPay.toLocaleString()}원`}</Text>
            }
            <Text style={styles.summarySub}>월 급여 · 입력 공제 기준</Text>
          </View>
        </View>

        <Text style={styles.netPayNotice}>세후 금액은 요율로 계산한 예상액이며, 실제 지급액과 다를 수 있어요.</Text>

        {employeeError && <ErrorMessage message={employeeError} onRetry={() => refetchEmp(true)} />}
        {histError && <ErrorMessage message="급여 조건 이력을 불러오지 못했어요." onRetry={refetchHist} />}
        {payrollError && <ErrorMessage message={payrollError} onRetry={refetchPay} />}
        {isAdmin && employees.some(employee => !employee.joined_at) && <View style={styles.workWarning}>
          <Text style={styles.workWarningBody}>입사일이 없는 직원은 등록일부터 임시 계산돼요. 직원 정보에서 입사일을 입력해 주세요.</Text>
          {employees.filter(employee => !employee.joined_at).map(employee => <TouchableOpacity key={employee.id} onPress={() => openEdit(employee)} style={{ minHeight: 44, justifyContent: 'center' }} accessibilityRole="button"><Text style={{ color: Colors.action }}>{employee.name} · 입사일 입력</Text></TouchableOpacity>)}
        </View>}
        {isAdmin && <PayrollSubmissionReview key={`${store?.id}:${yearMonth}`} yearMonth={yearMonth} active={active}
          employees={employees} payrolls={monthPayrolls} onApply={async (employee, submission) => {
            await refetchPay();
            if (workScopeRef.current !== workScope) return;
            setWorkSubmission(submission); setWorkTarget(employee);
          }} />}
        {/* 직원 목록 */}
        <Text style={styles.sectionLabel}>직원</Text>

        {empLoading ? (
          <ActivityIndicator color={Colors.primary} />
        ) : employeeError ? null : employees.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="아직 직원이 없어요"
            description="직원을 추가하면 4대보험과 실수령액이 자동으로 계산됩니다"
          />
        ) : (
          employees.map(emp => {
            const factor = accruedFactor(year, month);
            const daysInMonth = new Date(year, month, 0).getDate();
            const elapsed = Math.round(factor * daysInMonth);
            return (
            <EmployeeCard
              key={emp.id}
              employee={emp}
              payroll={monthPayrolls.find(p => p.employee_id === emp.id)}
              accruedGross={accruedForEmployee(emp)}
              accrualLabel={`${month}월 ${elapsed}/${daysInMonth}일 · ${monthPayrolls.find(p => p.employee_id === emp.id) ? '일할 누적' : '급여 이력 기준'}`}
              onShowHistory={() => setHistTarget(emp)}
              canCalculate={isAdmin}
              isCalculating={calculating === emp.id}
              onCalculate={() => { if (!isAdmin) { Alert.alert('관리자 확인 필요', '급여 작성은 관리자에게 요청해주세요.'); return; } setWorkSubmission(undefined); emp.employment_type === 'part_time' ? setWorkTarget(emp) : calculate(emp).catch(e => Alert.alert('계산 실패', getErrorMessage(e))); }}
              onWorkMinutes={isAdmin && !payLoading && !payrollError && emp.employment_type === 'part_time' ? () => { setWorkSubmission(undefined); setWorkTarget(emp); } : undefined}
              onSaveDeductions={deductions => {
                const payroll = monthPayrolls.find(p => p.employee_id === emp.id);
                if (!payroll) return Promise.resolve();
                return saveDeductions(payroll, deductions)
                  .then(() => { Alert.alert('저장 완료', '실제 공제 내역과 예상 실수령액을 반영했습니다.'); })
                  .catch(e => { Alert.alert('저장 실패', getErrorMessage(e)); throw e; });
              }}
              isSavingDeductions={savingDeductions === emp.id}
              canEditDeductions={isAdmin}
              onWageCondition={isAdmin ? () => router.push({ pathname: '/payroll/wage-condition', params: { storeId: store!.id, employeeId: emp.id, targetMonth: yearMonth, returnScope: pager?.returnScope ?? 'store' } }) : undefined}
              onEdit={isAdmin ? () => openEdit(emp) : undefined}
              onRemovePayroll={isAdmin ? () => {
                const p = payrolls.find(pr => pr.employee_id === emp.id);
                if (!p) return;
                Alert.alert('인건비 삭제', `${emp.name}의 ${yearMonth} 인건비를 삭제할까요?`, [
                  { text: '취소', style: 'cancel' },
                  {
                    text: '삭제', style: 'destructive',
                    onPress: () => { animateListChange(); removePayroll(p.id).catch(e => Alert.alert('삭제 실패', getErrorMessage(e))); },
                  },
                ]);
              } : undefined}
            />
            );
          })
        )}

        {isAdmin && (
          <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.7}>
            <Text style={styles.addBtnText}>+ 직원 추가</Text>
          </TouchableOpacity>
        )}

      </ScrollView>

      {/* 직원 추가/수정 모달 */}
      <SheetModal visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.modalSheet} showsVerticalScrollIndicator={false}>
            <View style={styles.modalHandle} />
            <View style={styles.sheetHeader}>
              <Pressable
                onPress={() => setModalVisible(false)}
                hitSlop={8}
                style={({ pressed }) => [styles.sheetHeaderBtn, pressed && styles.sheetHeaderBtnPressed]}
              >
                <Text style={styles.sheetCancelText}>취소</Text>
              </Pressable>
              <Text style={styles.sheetHeaderTitle}>{editTarget ? '직원 수정' : '직원 추가'}</Text>
              <Pressable
                onPress={handleSave}
                disabled={saving || !canSaveEmployee}
                hitSlop={8}
                style={({ pressed }) => [styles.sheetHeaderBtn, pressed && !saving && canSaveEmployee && styles.sheetHeaderBtnPressed]}
              >
                {saving
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Text style={[styles.sheetSaveText, !canSaveEmployee && styles.sheetSaveTextDisabled]}>저장</Text>}
              </Pressable>
            </View>

            <View style={styles.modalFieldGroup}>
              <Field
                label="이름"
                value={form.name}
                onChangeText={v => setForm(f => ({ ...f, name: v }))}
                placeholder="홍길동"
              />
            </View>

            <Text style={styles.fieldLabel}>고용 형태</Text>
            <View style={styles.chipRow}>
              {(['regular', 'part_time'] as EmploymentType[]).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, form.employment_type === t && styles.chipActive]}
                  disabled={!!editTarget}
                  onPress={() => setForm(f => ({ ...f, employment_type: t }))}
                >
                  <Text style={[styles.chipText, form.employment_type === t && styles.chipTextActive]}>
                    {t === 'regular' ? '정규직' : '파트타임'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {editTarget && <Text style={styles.fieldHint}>기존 직원의 고용 형태는 이 화면에서 변경하지 않아요. 전환이 필요하면 관리자에게 급여 조건 변경을 요청해 주세요.</Text>}
            <View style={styles.modalFieldGroup}>
              {form.employment_type === 'part_time' && (
                <Field
                  label="주 근무 시간 (15h 미만이면 3.3% 원천징수)"
                  value={form.weekly_hours}
                  onChangeText={v => setForm(f => ({ ...f, weekly_hours: v }))}
                  placeholder="예: 20"
                  keyboardType="numeric"
                />
              )}

              {!editTarget && (form.employment_type === 'part_time' ? (
                <Field
                  label="시급"
                  value={form.hourly_wage}
                  onChangeText={v => setForm(f => ({ ...f, hourly_wage: v }))}
                  placeholder="13,000"
                  keyboardType="numeric"
                  helpText="제출·확인한 월별 실근무 시간(분)으로 급여를 계산합니다."
                />
              ) : (
                <Field
                  label="기본급"
                  value={form.base_salary}
                  onChangeText={v => setForm(f => ({ ...f, base_salary: v }))}
                  placeholder="2,000,000"
                  keyboardType="numeric"
                />
              ))}
              {editTarget && <Text style={styles.summarySub}>금액·비과세·적용일은 직원 목록의 ‘급여 변경’에서 변경해 주세요.</Text>}

              {/* 비과세·부양가족: 정규직 또는 주15h 이상 파트타이머만 */}
              {(form.employment_type === 'regular' || Number(form.weekly_hours || '0') >= 15) && (
                <>
                  {!editTarget && <Field
                    label="비과세 (식대 등)"
                    value={form.non_taxable}
                    onChangeText={v => setForm(f => ({ ...f, non_taxable: v }))}
                    placeholder="200,000"
                    keyboardType="numeric"
                  />}
                  <Field
                    label="부양가족 수 (본인 포함)"
                    value={form.dependents}
                    onChangeText={v => setForm(f => ({ ...f, dependents: v }))}
                    placeholder="1"
                    keyboardType="numeric"
                  />
                </>
              )}

              <Field
                label="입사일 (YYYY-MM-DD) *"
                value={form.joined_at}
                onChangeText={v => setForm(f => ({ ...f, joined_at: v }))}
                placeholder="2026-06-01"
              />

              <Field
                label="연락처"
                value={form.phone}
                onChangeText={v => setForm(f => ({ ...f, phone: v }))}
                placeholder="010-0000-0000"
                keyboardType="phone-pad"
              />

              <Field
                label="은행"
                value={form.bank_name}
                onChangeText={v => setForm(f => ({ ...f, bank_name: v }))}
                placeholder="국민은행"
              />

              <Field
                label="계좌번호"
                value={form.account_number}
                onChangeText={v => setForm(f => ({ ...f, account_number: v }))}
                placeholder="000-0000-0000-00"
                keyboardType="numeric"
              />
            </View>

            {currentRole === 'admin' && (
              <>
                <Text style={styles.fieldLabel}>직원 계정</Text>
                <Text style={styles.fieldHint}>
                  {form.user_id ? '참여 계정이 연결되어 있어요.' : '직원이 참여코드로 참여 신청하면 승인 시 이름·연락처로 연결돼요.'}
                  {'\n'}신청 정보와 같은 이름·휴대폰 번호를 저장해주세요.
                </Text>
              </>
            )}

            {editTarget && isAdmin && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => {
                  Alert.alert('직원 삭제', `${editTarget.name}을(를) 삭제할까요?`, [
                    { text: '취소', style: 'cancel' },
                    {
                      text: '삭제', style: 'destructive',
                      onPress: async () => {
                        try {
                          await deactivate(editTarget.id);
                          setModalVisible(false);
                        } catch (e: any) {
                          Alert.alert('삭제 실패', getErrorMessage(e));
                        }
                      },
                    },
                  ]);
                }}
              >
                <Text style={styles.deleteBtnText}>직원 삭제</Text>
              </TouchableOpacity>
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SheetModal>

      {/* 급여 변경 적용일 확인 모달 */}


      {/* 급여 이력 모달 — 바깥 탭하면 닫힘 */}
      <SheetModal visible={histTarget != null} onRequestClose={() => setHistTarget(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setHistTarget(null)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{histTarget?.name} · 급여 이력</Text>
            <Text style={styles.fieldHint}>적용일 기준 변경 내역입니다. 과거 손익은 당시 급여로 계산됩니다.</Text>
            <ScrollView style={{ maxHeight: 360, marginTop: 8 }} showsVerticalScrollIndicator={false}>
              {(histTarget ? histMap[histTarget.id] ?? [] : []).length === 0 ? (
                <Text style={styles.histEmpty}>{histLoading ? '불러오는 중이에요' : histError ? '이력을 불러오지 못했어요. 목록에서 다시 불러와 주세요.' : '이력이 없어요'}</Text>
              ) : (
                (histMap[histTarget!.id] ?? []).map((h, i) => {
                  const isPart = histTarget!.employment_type === 'part_time';
                  const amount = isPart ? (h.hourly_wage ?? 0) : h.base_salary;
                  return (
                    <View key={h.id} style={[styles.histRow, i !== (histMap[histTarget!.id] ?? []).length - 1 && styles.histRowBorder]}>
                      <View style={styles.histLeft}>
                        <Text style={styles.histDate}>{h.effective_date}</Text>
                        {h.memo ? <Text style={styles.histMemo}>{h.memo}</Text> : null}
                      </View>
                      <Text style={styles.histAmount}>{amount.toLocaleString()}원{isPart ? '/시' : ''}</Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
            <TouchableOpacity style={[styles.cancelBtn, { marginTop: 16 }]} onPress={() => setHistTarget(null)}>
              <Text style={styles.cancelBtnText}>닫기</Text>
            </TouchableOpacity>
            <View style={{ height: 24 }} />
          </Pressable>
        </Pressable>
      </SheetModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas },
  topBar: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    backgroundColor: 'transparent',
  },
  title: { fontSize: 22, fontWeight: '700', color: Colors.black, letterSpacing: -0.5 },
  topBarRight: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  settlementBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, minHeight: 44, borderRadius: 12,
    backgroundColor: Colors.tinted,
  },
  settlementBtnText: { fontSize: 12, fontWeight: '700', color: Colors.action },
  monthPill: { fontSize: 12, color: Colors.gray500, backgroundColor: Colors.gray100, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  scroll: { padding: 20, paddingTop: 8, gap: 18, paddingBottom: 112 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.homeBorder },
  monthLabel: { fontSize: 15, fontWeight: '600', color: Colors.black },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: { flex: 1, minWidth: 140, backgroundColor: Colors.white, borderRadius: 24, borderWidth: 1, borderColor: Colors.homeBorder, padding: 16 },
  summaryLabel: { fontSize: 13, fontWeight: '500', color: Colors.gray600, marginBottom: 10 },
  summaryValue: { fontSize: 22, fontFamily: Fonts.spaceGroteskBold, fontWeight: '700', color: Colors.black, marginBottom: 6, letterSpacing: -0.5 },
  summaryLoader: { height: 24, marginBottom: 2 },
  netPayNotice: { fontSize: 12, lineHeight: 18, color: Colors.gray600 },
  summarySub: { fontSize: 11, lineHeight: 17, color: Colors.gray500 },
  sectionLabel: { fontSize: 17, fontWeight: '700', color: Colors.black },
  employeeCard: { ...CardStyle, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder, padding: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardNameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  employeeName: { fontSize: 16, fontWeight: '700', color: Colors.black, flexShrink: 1 },
  probationBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: Colors.warning + '20' },
  probationBadgeText: { fontSize: 11, fontWeight: '500', color: Colors.warning },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  histBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  editBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  confirmOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', padding: 24 },
  confirmCard: { width: '100%', backgroundColor: Colors.white, borderRadius: 20, padding: 22 },
  confirmTitle: { fontSize: 16, fontWeight: '700', color: Colors.black, marginBottom: 14 },
  confirmAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
  confirmOld: { fontSize: 15, color: Colors.gray400, textDecorationLine: 'line-through' },
  confirmNew: { fontSize: 17, fontWeight: '800' },
  confirmUp: { color: Colors.action },
  confirmDown: { color: '#DC2626' },
  confirmTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  confirmTagUp: { backgroundColor: Colors.tinted },
  confirmTagDown: { backgroundColor: '#FEF2F2' },
  confirmTagText: { fontSize: 11, fontWeight: '700' },

  histRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  histRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  histLeft: { gap: 2 },
  histDate: { fontSize: 14, fontWeight: '600', color: Colors.black },
  histMemo: { fontSize: 12, color: Colors.gray400 },
  histAmount: { fontFamily: Fonts.geistBold, fontVariant: ['tabular-nums'], fontSize: 14, fontWeight: '700', color: Colors.gray700 },
  histEmpty: { fontSize: 13, color: Colors.gray400, textAlign: 'center', paddingVertical: 32 },
  salaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  salaryLabel: { fontSize: 13, color: Colors.gray500 },
  salaryValue: { fontFamily: Fonts.geistBold, fontVariant: ['tabular-nums'], fontSize: 13, fontWeight: '500', color: Colors.black },
  summaryRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryNetLabel: { fontSize: 11, color: Colors.gray400, textAlign: 'right' },
  summaryNetValue: { fontFamily: Fonts.geistBold, fontVariant: ['tabular-nums'], fontSize: 14, fontWeight: '700', color: Colors.black, textAlign: 'right' },
  workWarning: { backgroundColor: Colors.warningBg, borderRadius: 16, padding: 14, gap: 4 },
  workWarningTitle: { fontSize: 14, fontWeight: '700', color: Colors.black },
  workWarningBody: { fontSize: 12, color: Colors.gray700, lineHeight: 18 },
  calcBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: 12, minHeight: 44, paddingVertical: 10, marginTop: 12 },
  calcBtnText: { fontSize: 13, fontWeight: '600', color: Colors.white },
  payrollResult: { marginTop: 4 },
  payrollDivider: { height: 0.5, backgroundColor: Colors.gray100, marginVertical: 10 },
  // Nostalgia: 급여명세서 영수증 스타일
  receiptDivider: { height: 0.5, backgroundColor: Colors.gray200, marginVertical: 10 },
  receiptHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  receiptHeading: { fontSize: 11, fontWeight: '700', color: Colors.gray500, letterSpacing: 1.2 },
  deductionHint: { fontSize: 11, lineHeight: 16, color: Colors.gray400, marginTop: 6, marginBottom: 8 },
  receiptRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    minHeight: 42, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
  },
  receiptLabel: { fontSize: 12, color: Colors.gray500 },
  deductionInputWrap: {
    minWidth: 128, height: 34, paddingHorizontal: 10, borderRadius: 9,
    borderWidth: 1, borderColor: Colors.gray200, backgroundColor: Colors.white,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
  },
  deductionInputWrapDisabled: { backgroundColor: Colors.gray50, borderColor: Colors.gray100 },
  deductionMinus: { fontSize: 13, color: Colors.gray400, marginRight: 2 },
  deductionInput: { minWidth: 72, paddingVertical: 0, fontSize: 13, fontWeight: '600', color: Colors.gray700, textAlign: 'right' },
  deductionWon: { fontSize: 12, color: Colors.gray500, marginLeft: 2 },
  deductionError: { fontSize: 11, color: Colors.negative, marginTop: 8, textAlign: 'right' },
  receiptTotalLine: { borderTopWidth: 2, borderTopColor: Colors.gray300, borderStyle: 'dashed', marginTop: 12 },
  receiptNetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  receiptNetLabel: { fontSize: 15, fontWeight: '800', color: Colors.black },
  receiptNetValue: { fontFamily: Fonts.geistBold, fontVariant: ['tabular-nums'], fontSize: 19, fontWeight: '800', color: Colors.action },
  payrollRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  payrollLabel: { fontSize: 14, fontWeight: '600', color: Colors.black },
  payrollNetPay: { fontSize: 14, fontWeight: '700', color: Colors.action },
  payrollDeductLabel: { fontSize: 12, color: Colors.gray400 },
  payrollDeduct: { fontSize: 12, color: Colors.gray500 },
  payrollActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  recalcBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  recalcBtnText: { fontSize: 12, color: Colors.gray400 },
  recalcBtnNeeded: { fontWeight: '700', color: Colors.action },
  saveDeductionBtn: { flex: 1.15, minHeight: 44, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  saveDeductionBtnDisabled: { opacity: 0.45 },
  saveDeductionBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  removePayrollRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  removePayrollBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  removePayrollBtnText: { fontSize: 12, color: '#D94040' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder, paddingVertical: 14 },
  addBtnText: { fontSize: 14, fontWeight: '600', color: Colors.action },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlay },
  modalSheet: { backgroundColor: Colors.homeCanvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '90%' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.gray200, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.black, marginBottom: 4 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.homeCanvas, marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.homeBorder },
  sheetHeaderTitle: { fontSize: 18, fontWeight: '700', color: Colors.black },
  sheetHeaderBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4, borderRadius: 12 },
  sheetHeaderBtnPressed: { backgroundColor: Colors.gray100 },
  sheetCancelText: { fontSize: 15, fontWeight: '500', color: Colors.gray500 },
  sheetSaveText: { fontSize: 15, fontWeight: '700', color: Colors.action },
  sheetSaveTextDisabled: { color: Colors.gray300 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginBottom: 6, marginTop: 14 },
  fieldHint: { fontSize: 13, color: Colors.gray500, marginBottom: 8, lineHeight: 19 },
  input: { minHeight: 44, borderWidth: 1, borderColor: Colors.homeBorder, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.black, backgroundColor: Colors.white },
  modalFieldGroup: { gap: 14, marginTop: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: Colors.homeBorder, backgroundColor: Colors.white },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.gray500 },
  chipTextActive: { color: Colors.white, fontWeight: '500' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  switchLabel: { fontSize: 14, fontWeight: '600', color: Colors.black },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn: { flex: 1, minHeight: 44, paddingVertical: 13, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.homeBorder, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.gray600 },
  saveBtn: { flex: 1, minHeight: 44, paddingVertical: 13, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '600', color: Colors.white },
  deleteBtn: { minHeight: 44, marginTop: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { fontSize: 14, color: '#D94040' },
});

export default PayrollScreen;
