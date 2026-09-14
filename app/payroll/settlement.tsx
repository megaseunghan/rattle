import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Spacing, CardStyle } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { getPayrollByMonth, settlePayrolls } from '../../lib/services/payroll';
import { getMonthlyWageByEmployee } from '../../lib/services/attendance';
import { Employee, Payroll } from '../../types';
import { AppBar, Badge, EmptyState } from '../../lib/components/ui';

function fmt(n: number): string {
  return `${n.toLocaleString()}원`;
}

function minutesToHours(minutes: number): string {
  return `${Math.round(minutes / 60)}h`;
}

/** 화면 42: 급여 정산 리포트 (사장님 전용, 인건비 화면에서 진입) */
export default function PayrollSettlementScreen() {
  const { yearMonth: yearMonthParam } = useLocalSearchParams<{ yearMonth?: string }>();
  const today = new Date();
  const yearMonth = yearMonthParam ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = `${Number(yearMonth.slice(5, 7))}월`;

  const { store } = useAuth();
  const { employees, loading: empLoading } = useEmployees();
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [wageMap, setWageMap] = useState<Record<string, { totalMinutes: number }>>({});
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);

  const load = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    try {
      const [payrollResult, wageResult] = await Promise.all([
        getPayrollByMonth(store.id, yearMonth),
        getMonthlyWageByEmployee(store.id, yearMonth, store.closing_time ?? '23:00'),
      ]);
      setPayrolls(payrollResult);
      setWageMap(wageResult);
    } finally {
      setLoading(false);
    }
  }, [store, yearMonth]);

  useEffect(() => { load(); }, [load]);

  const rows = employees
    .map(emp => ({ employee: emp, payroll: payrolls.find(p => p.employee_id === emp.id) }))
    .filter((r): r is { employee: Employee; payroll: Payroll } => !!r.payroll);

  const totalAmount = rows.reduce((s, r) => s + r.payroll.net_pay, 0);
  const settledCount = rows.filter(r => r.payroll.is_settled).length;

  const handleSettleAll = () => {
    const unsettledIds = rows.filter(r => !r.payroll.is_settled).map(r => r.payroll.id);
    if (unsettledIds.length === 0) {
      Alert.alert('안내', '이미 모든 정산이 완료되었습니다');
      return;
    }
    Alert.alert('전체 정산 확정', `${monthLabel} 급여 ${unsettledIds.length}건을 정산 완료로 확정할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '확정',
        onPress: async () => {
          setSettling(true);
          try {
            await settlePayrolls(unsettledIds);
            await load();
          } catch (e: any) {
            Alert.alert('정산 실패', e.message);
          } finally {
            setSettling(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppBar title={`${monthLabel} 급여 정산`} onBack={() => router.back()} />

      {loading || empLoading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>총 지급 예정액 · {rows.length}명</Text>
            <Text style={styles.summaryValue}>{fmt(totalAmount)}</Text>
          </View>

          <View style={styles.listHeader}>
            <Text style={styles.sectionLabel}>직원별 정산 내역</Text>
            <Text style={styles.progressLabel}>{settledCount} / {rows.length} 완료</Text>
          </View>

          {rows.length === 0 ? (
            <EmptyState
              icon="document-text-outline"
              title="정산할 급여 내역이 없어요"
              description="인건비 화면에서 먼저 급여를 계산해주세요"
            />
          ) : (
            rows.map(({ employee, payroll }) => {
              const minutes = wageMap[employee.id]?.totalMinutes ?? 0;
              const isPart = employee.employment_type === 'part_time';
              const deduction = payroll.gross - payroll.net_pay;
              return (
                <View key={employee.id} style={styles.row}>
                  <View style={styles.rowTop}>
                    <Text style={styles.name}>{employee.name}</Text>
                    <Badge label={payroll.is_settled ? '정산완료' : '대기'} variant={payroll.is_settled ? 'positive' : 'neutral'} />
                  </View>
                  <Text style={styles.meta}>
                    근무 {minutesToHours(minutes)}{isPart ? ' (파트타이머)' : ''}
                    {'  '}{isPart ? `시급 ${fmt(employee.hourly_wage ?? 0)}` : `기본급 ${fmt(employee.base_salary)}`}
                  </Text>
                  {employee.bank_name && employee.account_number && (
                    <Text style={styles.meta}>{employee.bank_name} {employee.account_number}</Text>
                  )}
                  <View style={styles.rowBottom}>
                    {deduction > 0 && (
                      <Text style={styles.deduction}>공제 -{fmt(deduction)}</Text>
                    )}
                    <Text style={styles.netPay}>{fmt(payroll.net_pay)}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {rows.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.confirmBtn, settling && { opacity: 0.6 }]}
            onPress={handleSettleAll}
            disabled={settling}
            activeOpacity={0.85}
          >
            {settling
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.confirmBtnText}>전체 정산 확정하기</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  scroll: { padding: Spacing.screenX, paddingBottom: 32, gap: 12 },

  summaryCard: {
    ...CardStyle,
    backgroundColor: Colors.tinted,
    gap: 6,
  },
  summaryLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  summaryValue: { fontSize: 28, fontWeight: '800', color: Colors.black },

  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: Colors.black },
  progressLabel: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  row: { ...CardStyle, gap: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '700', color: Colors.black },
  meta: { fontSize: 12, color: Colors.gray500 },
  rowBottom: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 6 },
  deduction: { fontSize: 12, color: Colors.negative },
  netPay: { fontSize: 16, fontWeight: '800', color: Colors.black },

  footer: { padding: Spacing.screenX, borderTopWidth: 0.5, borderTopColor: Colors.gray100 },
  confirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
