import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { usePayroll } from '../../lib/hooks/usePayroll';
import { Employee, EmploymentType, StoreMember } from '../../types';
import { isInProbation, isInsuranceApplicable } from '../../lib/services/employees';

function toYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function EmployeeCard({
  employee,
  payroll,
  isCalculating,
  onCalculate,
  onEdit,
  onRemovePayroll,
}: {
  employee: Employee;
  payroll: ReturnType<typeof usePayroll>['payrolls'][0] | undefined;
  isCalculating: boolean;
  onCalculate: () => void;
  onEdit: () => void;
  onRemovePayroll?: () => void;
}) {
  const probation = isInProbation(employee);
  const insurance = isInsuranceApplicable(employee);

  return (
    <View style={styles.employeeCard}>
      <View style={styles.cardHeader}>
        <View style={styles.cardNameRow}>
          <Text style={styles.employeeName}>{employee.name}</Text>
          <View style={[styles.typeBadge, employee.employment_type === 'regular' ? styles.badgeRegular : styles.badgePart]}>
            <Text style={[styles.typeBadgeText, employee.employment_type === 'regular' ? styles.badgeRegularText : styles.badgePartText]}>
              {employee.employment_type === 'regular' ? '정규직' : '파트타임'}
            </Text>
          </View>
          {probation && (
            <View style={styles.probationBadge}>
              <Text style={styles.probationBadgeText}>수습</Text>
            </View>
          )}
          {!insurance && (
            <View style={styles.taxBadge}>
              <Text style={styles.taxBadgeText}>3.3%</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={onEdit} style={styles.editBtn}>
          <Ionicons name="ellipsis-horizontal" size={16} color={Colors.gray400} />
        </TouchableOpacity>
      </View>

      <View style={styles.salaryRow}>
        <Text style={styles.salaryLabel}>기본급</Text>
        <Text style={styles.salaryValue}>{employee.base_salary.toLocaleString()}원</Text>
      </View>

      {payroll ? (
        <View style={styles.payrollResult}>
          <View style={styles.payrollDivider} />
          <View style={styles.payrollRow}>
            <Text style={styles.payrollLabel}>실수령액</Text>
            <Text style={styles.payrollNetPay}>{payroll.net_pay.toLocaleString()}원</Text>
          </View>
          {insurance ? (
            <>
              <View style={styles.payrollRow}>
                <Text style={styles.payrollDeductLabel}>국민연금</Text>
                <Text style={styles.payrollDeduct}>-{payroll.national_pension.toLocaleString()}원</Text>
              </View>
              <View style={styles.payrollRow}>
                <Text style={styles.payrollDeductLabel}>건강·장기요양</Text>
                <Text style={styles.payrollDeduct}>-{(payroll.health_insurance + payroll.long_term_care).toLocaleString()}원</Text>
              </View>
              <View style={styles.payrollRow}>
                <Text style={styles.payrollDeductLabel}>고용보험</Text>
                <Text style={styles.payrollDeduct}>-{payroll.employment_insurance.toLocaleString()}원</Text>
              </View>
              <View style={styles.payrollRow}>
                <Text style={styles.payrollDeductLabel}>소득세</Text>
                <Text style={styles.payrollDeduct}>-{payroll.income_tax.toLocaleString()}원</Text>
              </View>
              <View style={styles.payrollRow}>
                <Text style={styles.payrollDeductLabel}>지방소득세</Text>
                <Text style={styles.payrollDeduct}>-{payroll.local_income_tax.toLocaleString()}원</Text>
              </View>
            </>
          ) : (
            <View style={styles.payrollRow}>
              <Text style={styles.payrollDeductLabel}>3.3% 원천징수</Text>
              <Text style={styles.payrollDeduct}>-{payroll.withholding_tax.toLocaleString()}원</Text>
            </View>
          )}
          <View style={styles.payrollActions}>
            <TouchableOpacity style={styles.recalcBtn} onPress={onCalculate} disabled={isCalculating}>
              {isCalculating
                ? <ActivityIndicator size="small" color={Colors.gray500} />
                : <Text style={styles.recalcBtnText}>재계산</Text>
              }
            </TouchableOpacity>
            {onRemovePayroll && (
              <TouchableOpacity style={styles.removePayrollBtn} onPress={onRemovePayroll}>
                <Text style={styles.removePayrollBtnText}>삭제</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
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
      )}
    </View>
  );
}

const EMPTY_FORM = {
  name: '',
  employment_type: 'regular' as EmploymentType,
  base_salary: '',
  non_taxable: '',
  joined_at: '',
  phone: '',
  bank_name: '',
  account_number: '',
  weekly_hours: '',
  dependents: '1',
  user_id: null as string | null,
};

export default function PayrollScreen() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const yearMonth = toYearMonth(year, month);
  const { employees, loading: empLoading, refetch: refetchEmp, add, update, deactivate } = useEmployees();
  const { payrolls, loading: payLoading, calculating, refetch: refetchPay, calculate, remove: removePayroll } = usePayroll(yearMonth);

  const { store, currentRole } = useAuth();
  const isAdmin = currentRole === 'admin';
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<StoreMember[]>([]);

  useFocusEffect(useCallback(() => {
    refetchEmp();
    refetchPay();
  }, [refetchEmp, refetchPay]));

  // 계정 연결용 매장 멤버 목록 (관리자만)
  useEffect(() => {
    if (!store || currentRole !== 'admin') return;
    supabase
      .from('store_members')
      .select('*')
      .eq('store_id', store.id)
      .eq('status', 'approved')
      .then(({ data }) => setMembers((data ?? []) as StoreMember[]));
  }, [store, currentRole]);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  function openAdd() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }

  function openEdit(employee: Employee) {
    // 일반 멤버는 파트타이머만 수정 가능, 정규직은 관리자 전용
    if (!isAdmin && employee.employment_type !== 'part_time') {
      Alert.alert('수정 권한 없음', '정규직 직원의 인건비는 관리자만 수정할 수 있어요.');
      return;
    }
    setEditTarget(employee);
    setForm({
      name: employee.name,
      employment_type: employee.employment_type,
      base_salary: String(employee.base_salary),
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
    const salary = Number(form.base_salary.replace(/,/g, ''));
    const nonTaxable = Number(form.non_taxable.replace(/,/g, '') || '0');
    const dep = Number(form.dependents || '1');
    const wh = form.weekly_hours ? Number(form.weekly_hours) : null;

    if (!name) { Alert.alert('입력 오류', '이름을 입력해주세요.'); return; }
    if (!salary || salary <= 0) { Alert.alert('입력 오류', '기본급을 입력해주세요.'); return; }

    setSaving(true);
    try {
      const payload = {
        name,
        employment_type: form.employment_type,
        base_salary: salary,
        non_taxable: nonTaxable,
        joined_at: form.joined_at.trim() || null,
        phone: form.phone.trim() || null,
        bank_name: form.bank_name.trim() || null,
        account_number: form.account_number.trim() || null,
        weekly_hours: form.employment_type === 'part_time' ? wh : null,
        dependents: dep,
        user_id: form.user_id,
      };

      if (editTarget) {
        await update(editTarget.id, payload);
      } else {
        await add(payload);
      }
      setModalVisible(false);
    } catch (e: any) {
      Alert.alert('저장 실패', e.message);
    } finally {
      setSaving(false);
    }
  }

  const totalLaborCost = payrolls.reduce((s, p) => s + p.gross, 0);
  const totalNetPay = payrolls.reduce((s, p) => s + p.net_pay, 0);
  const monthLabel = `${year}년 ${month}월`;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.title}>직원관리</Text>
        <Text style={styles.monthPill}>{monthLabel}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* 월 네비게이션 */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={prevMonth} style={styles.navBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={20} color={Colors.gray600} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <TouchableOpacity onPress={nextMonth} style={styles.navBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray600} />
          </TouchableOpacity>
        </View>

        {/* 요약 카드 */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>총 인건비</Text>
            {payLoading
              ? <ActivityIndicator size="small" color={Colors.gray300} style={styles.summaryLoader} />
              : <Text style={styles.summaryValue}>{totalLaborCost > 0 ? `${totalLaborCost.toLocaleString()}원` : '—'}</Text>
            }
            <Text style={styles.summarySub}>세전 지급액</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>총 실수령액</Text>
            {payLoading
              ? <ActivityIndicator size="small" color={Colors.gray300} style={styles.summaryLoader} />
              : <Text style={styles.summaryValue}>{totalNetPay > 0 ? `${totalNetPay.toLocaleString()}원` : '—'}</Text>
            }
            <Text style={styles.summarySub}>공제 후 지급액</Text>
          </View>
        </View>

        {/* 직원 목록 */}
        <Text style={styles.sectionLabel}>직원</Text>

        {empLoading ? (
          <ActivityIndicator color={Colors.primary} />
        ) : employees.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="people-outline" size={28} color={Colors.gray300} />
            </View>
            <Text style={styles.emptyTitle}>아직 직원이 없어요</Text>
            <Text style={styles.emptyDesc}>직원을 추가하면 4대보험과 실수령액이 자동으로 계산됩니다</Text>
          </View>
        ) : (
          employees.map(emp => (
            <EmployeeCard
              key={emp.id}
              employee={emp}
              payroll={payrolls.find(p => p.employee_id === emp.id)}
              isCalculating={calculating === emp.id}
              onCalculate={() => calculate(emp).catch(e => Alert.alert('계산 실패', e.message))}
              onEdit={() => openEdit(emp)}
              onRemovePayroll={() => {
                const p = payrolls.find(pr => pr.employee_id === emp.id);
                if (!p) return;
                Alert.alert('인건비 삭제', `${emp.name}의 ${yearMonth} 인건비를 삭제할까요?`, [
                  { text: '취소', style: 'cancel' },
                  {
                    text: '삭제', style: 'destructive',
                    onPress: () => removePayroll(p.id).catch(e => Alert.alert('삭제 실패', e.message)),
                  },
                ]);
              }}
            />
          ))
        )}

        {isAdmin && (
          <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.7}>
            <Ionicons name="person-add-outline" size={16} color={Colors.gray700} />
            <Text style={styles.addBtnText}>직원 추가</Text>
          </TouchableOpacity>
        )}

      </ScrollView>

      {/* 직원 추가/수정 모달 */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.modalSheet} showsVerticalScrollIndicator={false}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editTarget ? '직원 수정' : '직원 추가'}</Text>

            <Text style={styles.fieldLabel}>이름</Text>
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={v => setForm(f => ({ ...f, name: v }))}
              placeholder="홍길동"
              placeholderTextColor={Colors.gray300}
            />

            <Text style={styles.fieldLabel}>고용 형태</Text>
            <View style={styles.chipRow}>
              {(['regular', 'part_time'] as EmploymentType[]).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, form.employment_type === t && styles.chipActive]}
                  onPress={() => setForm(f => ({ ...f, employment_type: t }))}
                >
                  <Text style={[styles.chipText, form.employment_type === t && styles.chipTextActive]}>
                    {t === 'regular' ? '정규직' : '파트타임'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {form.employment_type === 'part_time' && (
              <>
                <Text style={styles.fieldLabel}>주 근무 시간 (15h 미만이면 3.3% 원천징수)</Text>
                <TextInput
                  style={styles.input}
                  value={form.weekly_hours}
                  onChangeText={v => setForm(f => ({ ...f, weekly_hours: v }))}
                  placeholder="예: 20"
                  placeholderTextColor={Colors.gray300}
                  keyboardType="numeric"
                />
              </>
            )}

            <Text style={styles.fieldLabel}>기본급</Text>
            <TextInput
              style={styles.input}
              value={form.base_salary}
              onChangeText={v => setForm(f => ({ ...f, base_salary: v }))}
              placeholder="2,000,000"
              placeholderTextColor={Colors.gray300}
              keyboardType="numeric"
            />

            <Text style={styles.fieldLabel}>비과세 (식대 등)</Text>
            <TextInput
              style={styles.input}
              value={form.non_taxable}
              onChangeText={v => setForm(f => ({ ...f, non_taxable: v }))}
              placeholder="200,000"
              placeholderTextColor={Colors.gray300}
              keyboardType="numeric"
            />

            <Text style={styles.fieldLabel}>부양가족 수 (본인 포함)</Text>
            <TextInput
              style={styles.input}
              value={form.dependents}
              onChangeText={v => setForm(f => ({ ...f, dependents: v }))}
              placeholder="1"
              placeholderTextColor={Colors.gray300}
              keyboardType="numeric"
            />

            <Text style={styles.fieldLabel}>입사일 (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={form.joined_at}
              onChangeText={v => setForm(f => ({ ...f, joined_at: v }))}
              placeholder="2026-06-01"
              placeholderTextColor={Colors.gray300}
            />

            <Text style={styles.fieldLabel}>연락처</Text>
            <TextInput
              style={styles.input}
              value={form.phone}
              onChangeText={v => setForm(f => ({ ...f, phone: v }))}
              placeholder="010-0000-0000"
              placeholderTextColor={Colors.gray300}
              keyboardType="phone-pad"
            />

            <Text style={styles.fieldLabel}>은행</Text>
            <TextInput
              style={styles.input}
              value={form.bank_name}
              onChangeText={v => setForm(f => ({ ...f, bank_name: v }))}
              placeholder="국민은행"
              placeholderTextColor={Colors.gray300}
            />

            <Text style={styles.fieldLabel}>계좌번호</Text>
            <TextInput
              style={styles.input}
              value={form.account_number}
              onChangeText={v => setForm(f => ({ ...f, account_number: v }))}
              placeholder="000-0000-0000-00"
              placeholderTextColor={Colors.gray300}
              keyboardType="numeric"
            />

            {currentRole === 'admin' && (
              <>
                <Text style={styles.fieldLabel}>출퇴근 계정 연결</Text>
                <Text style={styles.fieldHint}>연결된 계정으로 로그인한 직원만 본인 출퇴근을 찍을 수 있어요.</Text>
                <View style={styles.memberWrap}>
                  <TouchableOpacity
                    style={[styles.memberChip, form.user_id == null && styles.memberChipOn]}
                    onPress={() => setForm(f => ({ ...f, user_id: null }))}
                  >
                    <Text style={[styles.memberChipText, form.user_id == null && styles.memberChipTextOn]}>연결 안함</Text>
                  </TouchableOpacity>
                  {members.map(m => (
                    <TouchableOpacity
                      key={m.user_id}
                      style={[styles.memberChip, form.user_id === m.user_id && styles.memberChipOn]}
                      onPress={() => setForm(f => ({ ...f, user_id: m.user_id }))}
                    >
                      <Text style={[styles.memberChipText, form.user_id === m.user_id && styles.memberChipTextOn]}>
                        {m.user_email ?? m.user_id.slice(0, 8)}{m.role === 'admin' ? ' (관리자)' : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Text style={styles.saveBtnText}>저장</Text>
                }
              </TouchableOpacity>
            </View>
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
                          Alert.alert('삭제 실패', e.message);
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
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
  },
  title: { fontSize: 17, fontWeight: '600', color: Colors.black },
  monthPill: { fontSize: 12, color: Colors.gray500, backgroundColor: Colors.gray100, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  scroll: { padding: 16, gap: 14, paddingBottom: 48 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: Colors.white, borderWidth: 0.5, borderColor: Colors.gray100 },
  monthLabel: { fontSize: 15, fontWeight: '600', color: Colors.black },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, backgroundColor: Colors.white, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.gray100, padding: 14 },
  summaryLabel: { fontSize: 11, color: Colors.gray400, marginBottom: 4 },
  summaryValue: { fontSize: 20, fontWeight: '600', color: Colors.black, marginBottom: 2 },
  summaryLoader: { height: 24, marginBottom: 2 },
  summarySub: { fontSize: 11, color: Colors.gray400 },
  sectionLabel: { fontSize: 11, fontWeight: '500', color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5 },
  employeeCard: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.gray100, padding: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  employeeName: { fontSize: 15, fontWeight: '600', color: Colors.black },
  typeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  badgeRegular: { backgroundColor: Colors.primary + '18' },
  badgePart: { backgroundColor: Colors.gray100 },
  typeBadgeText: { fontSize: 11, fontWeight: '500' },
  badgeRegularText: { color: Colors.primary },
  badgePartText: { color: Colors.gray500 },
  probationBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: Colors.warning + '20' },
  probationBadgeText: { fontSize: 11, fontWeight: '500', color: Colors.warning },
  taxBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: Colors.gray100 },
  taxBadgeText: { fontSize: 11, fontWeight: '500', color: Colors.gray500 },
  editBtn: { padding: 4 },
  salaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  salaryLabel: { fontSize: 13, color: Colors.gray500 },
  salaryValue: { fontSize: 13, fontWeight: '500', color: Colors.black },
  calcBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.black, borderRadius: 10, paddingVertical: 10, marginTop: 12 },
  calcBtnText: { fontSize: 13, fontWeight: '600', color: Colors.white },
  payrollResult: { marginTop: 4 },
  payrollDivider: { height: 0.5, backgroundColor: Colors.gray100, marginVertical: 10 },
  payrollRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  payrollLabel: { fontSize: 14, fontWeight: '600', color: Colors.black },
  payrollNetPay: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  payrollDeductLabel: { fontSize: 12, color: Colors.gray400 },
  payrollDeduct: { fontSize: 12, color: Colors.gray500 },
  payrollActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  recalcBtn: { paddingVertical: 8 },
  recalcBtnText: { fontSize: 12, color: Colors.gray400 },
  removePayrollBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  removePayrollBtnText: { fontSize: 12, color: '#D94040' },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.gray100, padding: 40, alignItems: 'center', gap: 8 },
  emptyIconWrap: { width: 60, height: 60, borderRadius: 18, backgroundColor: Colors.gray50, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: Colors.gray700 },
  emptyDesc: { fontSize: 13, color: Colors.gray400, textAlign: 'center', lineHeight: 18 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.white, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.gray200, paddingVertical: 14 },
  addBtnText: { fontSize: 14, color: Colors.gray700 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  modalSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '90%' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.gray200, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.black, marginBottom: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginBottom: 6, marginTop: 14 },
  fieldHint: { fontSize: 11, color: Colors.gray400, marginBottom: 8, lineHeight: 16 },
  input: { borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.black, backgroundColor: Colors.gray50 },
  memberWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.gray200, backgroundColor: Colors.gray50 },
  memberChipOn: { borderColor: Colors.primary, backgroundColor: Colors.tinted },
  memberChipText: { fontSize: 12, color: Colors.gray500, fontWeight: '500' },
  memberChipTextOn: { color: Colors.primary, fontWeight: '700' },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.gray200, backgroundColor: Colors.gray50 },
  chipActive: { backgroundColor: Colors.black, borderColor: Colors.black },
  chipText: { fontSize: 13, color: Colors.gray500 },
  chipTextActive: { color: Colors.white, fontWeight: '500' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  switchLabel: { fontSize: 14, fontWeight: '600', color: Colors.black },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.gray100, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.gray600 },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.black, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '600', color: Colors.white },
  deleteBtn: { marginTop: 12, paddingVertical: 13, alignItems: 'center' },
  deleteBtnText: { fontSize: 14, color: '#D94040' },
});
