import { NumericText } from '../../lib/components/ui/NumericText';
import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../../lib/icons/AppIcon';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { Spacing } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { getMyPayroll } from '../../lib/services/payroll';
import { Payroll } from '../../types';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { getErrorMessage } from '../../lib/utils/error';
import { formatWorkedMinutes } from '../../lib/utils/workMinutes';
import { resolveSelfEmployee } from '../../lib/utils/resolveSelfEmployee';
import { AppBar } from '../../lib/components/ui';

function fmt(v: number): string {
  return `${v.toLocaleString()}원`;
}

function Row({ label, sub, value, isDeduction, isTotal }: {
  label: string; sub?: string; value: number | null; isDeduction?: boolean; isTotal?: boolean;
}) {
  return (
    <View style={[styles.row, isTotal && styles.rowTotal]}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      <NumericText style={[styles.rowValue, isDeduction && value != null && value !== 0 && styles.rowValueNegative]}>
        {value == null ? '확인 필요' : isDeduction && value !== 0 ? `−${fmt(value)}` : fmt(value)}
      </NumericText>
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.groupCard}>{children}</View>
    </View>
  );
}

export default function PayslipScreen() {
  const { user, store, realRole, devPreviewMode, devPreviewEmployeeId } = useAuth();
  const { employees, loading: employeesLoading, error: employeesError, refetch: refetchEmployees } = useEmployees();
  const myEmployee = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId);
  const isPreviewing = realRole === 'admin' && devPreviewMode !== 'self';

  useEffect(() => { refetchEmployees(); }, [refetchEmployees]);

  const now = new Date();
  const [{ year, month }, setPeriod] = useState(() => ({ year: now.getFullYear(), month: now.getMonth() + 1 }));
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<{ scope: object; payroll: Payroll | null; error: string | null } | null>(null);

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  const employeeId = user?.id && store?.id && myEmployee?.store_id === store.id && !employeesError && !employeesLoading ? myEmployee?.id : undefined;
  const scope = useMemo(() => ({}), [user?.id, store?.id, realRole, devPreviewMode, devPreviewEmployeeId, employeeId, yearMonth, reload]);
  const payroll = result?.scope === scope ? result.payroll : null;
  const error = result?.scope === scope ? result.error : null;
  const loading = employeesLoading || (!!employeeId && result?.scope !== scope);

  useEffect(() => {
    if (!employeeId) return;
    let active = true;
    void getMyPayroll(employeeId, yearMonth).then(data => {
      if (active) setResult({ scope, payroll: data, error: null });
    }).catch(e => {
      if (active) setResult({ scope, payroll: null, error: getErrorMessage(e) });
    });
    return () => { active = false; };
  }, [scope, employeeId, yearMonth]);

  function prevMonth() {
    setPeriod(period => period.month === 1
      ? { year: period.year - 1, month: 12 }
      : { ...period, month: period.month - 1 });
  }
  function nextMonth() {
    if (isCurrentMonth) return;
    setPeriod(period => {
      if (period.year === now.getFullYear() && period.month === now.getMonth() + 1) return period;
      return period.month === 12
        ? { year: period.year + 1, month: 1 }
        : { ...period, month: period.month + 1 };
    });
  }

  // 과거 명세의 누락값을 현재 급여 조건이나 0원으로 보충하지 않는다.
  const taxableBase = payroll?.taxable_base ?? null;
  const totalDeduction = payroll ? payroll.gross - payroll.net_pay : 0;

  return (
    <SafeAreaView style={styles.container}>
      <AppBar title="급여 명세서" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {isPreviewing && myEmployee && (
          <View style={styles.previewBanner}>
            <AppIcon name="eye-outline" size={16} color={Colors.warningStroke} />
            <Text style={styles.previewBannerText}>{myEmployee.name}님 급여 명세서 미리보기</Text>
          </View>
        )}

        <View style={styles.monthNav}>
          <TouchableOpacity onPress={prevMonth} style={styles.monthButton} hitSlop={8} accessibilityRole="button" accessibilityLabel="이전 달">
            <AppIcon name="chevron-back" size={18} color={Colors.gray600} />
          </TouchableOpacity>
          <NumericText style={styles.monthLabel}>{year}년 {month}월</NumericText>
          <TouchableOpacity onPress={nextMonth} style={styles.monthButton} hitSlop={8} disabled={isCurrentMonth} accessibilityRole="button" accessibilityLabel="다음 달" accessibilityState={{ disabled: isCurrentMonth }}>
            <AppIcon name="chevron-forward" size={18} color={isCurrentMonth ? Colors.gray300 : Colors.gray600} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />
        ) : employeesError || error ? (
          <ErrorMessage message={employeesError || error!} onRetry={() => { if (employeesError) void refetchEmployees(); else setReload(n => n + 1); }} />
        ) : !employeeId ? (
          <Text style={styles.emptyText}>연결된 직원 정보를 확인해주세요.</Text>
        ) : !payroll ? (
          <View style={styles.empty}>
            <AppIcon name="document-text-outline" size={28} color={Colors.gray300} />
            <Text style={styles.emptyText}>이 달은 아직 급여명세가 작성되지 않았어요</Text>
          </View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <NumericText style={styles.netPay} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{fmt(payroll.net_pay)}</NumericText>
              <Text style={styles.summaryLine}>지급 {fmt(payroll.gross)} − 공제 {fmt(totalDeduction)}</Text>
              {(payroll.worked_minutes != null) && (
                <Text style={styles.summaryLine}>급여 작성 근무: {formatWorkedMinutes(payroll.worked_minutes)}</Text>
              )}
            </View>

            <Group title="지급 항목">
              <Row label="세전 지급 총액" value={payroll.gross} />
              <Row label="명세에 저장된 과세 기준액" value={taxableBase} />
            </Group>
            <Text style={styles.footnote}>저장된 명세 금액이에요. 당시 기본급·비과세 세부 조건은 관리자에게 확인해주세요.</Text>

            <Group title="공제 항목">
              <Row label="국민연금" value={payroll.national_pension} isDeduction />
              <Row label="건강보험" value={payroll.health_insurance} isDeduction />
              <Row label="장기요양보험" value={payroll.long_term_care} isDeduction />
              <Row label="고용보험" value={payroll.employment_insurance} isDeduction />
              <Row label="소득세" value={payroll.income_tax} isDeduction />
              <Row label="지방소득세" value={payroll.local_income_tax} isDeduction />
              <Row label="원천징수" value={payroll.withholding_tax} isDeduction />
              <Row label="공제 합계" value={totalDeduction} isDeduction isTotal />
            </Group>

            <Group title="실지급액">
              <Row label="실지급액" value={payroll.net_pay} isTotal />
            </Group>


          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas },
  scroll: { padding: Spacing.screenX, paddingBottom: 40, gap: 14 },

  previewBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.warningBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
  },
  previewBannerText: { flex: 1, fontSize: 12, fontWeight: '500', color: Colors.warningStroke },

  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  monthButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 16, fontWeight: '700', color: Colors.black, minWidth: 96, textAlign: 'center' },

  summaryCard: { alignItems: 'center', gap: 6, padding: 20, backgroundColor: Colors.white, borderRadius: 24, borderWidth: 1, borderColor: Colors.homeBorder },
  netPay: { fontSize: 30, fontFamily: Fonts.spaceGroteskBold, fontWeight: '700', maxWidth: '100%', color: Colors.black, letterSpacing: -0.5 },
  summaryLine: { fontVariant: ['tabular-nums'], textAlign: 'center', fontSize: 12, fontWeight: '500', color: Colors.gray400 },

  group: { gap: 8 },
  groupTitle: { fontSize: 13, fontWeight: '700', color: Colors.gray600 },
  groupCard: {
    backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12, gap: 12,
    borderBottomWidth: 0.5, borderBottomColor: Colors.homeBorder,
  },
  rowTotal: { backgroundColor: Colors.gray50, borderBottomWidth: 0 },
  rowLeft: { flexGrow: 1, flexShrink: 1, minWidth: 100, gap: 2 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: Colors.black },
  rowSub: { fontSize: 11, fontWeight: '400', color: Colors.gray400 },
  rowValue: { fontVariant: ['tabular-nums'], maxWidth: '100%', textAlign: 'right', fontSize: 14, fontWeight: '700', color: Colors.black },
  rowValueNegative: { color: Colors.negative },

  footnote: { fontSize: 11, fontWeight: '400', color: Colors.gray400, lineHeight: 16 },

  empty: { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyText: { fontSize: 14, color: Colors.gray400 },
});
