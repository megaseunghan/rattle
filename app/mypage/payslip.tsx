import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { Spacing } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { getMyPayroll } from '../../lib/services/payroll';
import { Payroll } from '../../types';
import { formatWorkedMinutes } from '../../lib/utils/workMinutes';
import { resolveSelfEmployee } from '../../lib/utils/resolveSelfEmployee';
import { AppBar } from '../../lib/components/ui';

function fmt(v: number): string {
  return `${v.toLocaleString()}원`;
}

function Row({ label, sub, value, isDeduction, isTotal }: {
  label: string; sub?: string; value: number; isDeduction?: boolean; isTotal?: boolean;
}) {
  return (
    <View style={[styles.row, isTotal && styles.rowTotal]}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      <Text style={[styles.rowValue, isDeduction && styles.rowValueNegative]}>
        {isDeduction ? `−${fmt(value)}` : fmt(value)}
      </Text>
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
  const { user, realRole, devPreviewMode, devPreviewEmployeeId } = useAuth();
  const { employees, refetch: refetchEmployees } = useEmployees();
  const myEmployee = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId);
  const isPreviewing = realRole === 'admin' && devPreviewMode !== 'self';

  useEffect(() => { refetchEmployees(); }, [refetchEmployees]);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [payroll, setPayroll] = useState<Payroll | null>(null);
  const [loading, setLoading] = useState(false);

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  useEffect(() => {
    if (!myEmployee) return;
    setLoading(true);
    getMyPayroll(myEmployee.id, yearMonth)
      .then(setPayroll)
      .finally(() => setLoading(false));
  }, [myEmployee?.id, yearMonth]);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (isCurrentMonth) return;
    if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1);
  }

  const isPartTime = myEmployee?.employment_type === 'part_time';
  const nonTaxable = myEmployee?.non_taxable ?? 0;
  const taxableBase = payroll?.taxable_base ?? 0;
  const totalDeduction = payroll ? payroll.gross - payroll.net_pay : 0;

  return (
    <SafeAreaView style={styles.container}>
      <AppBar title="급여 명세서" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {isPreviewing && myEmployee && (
          <View style={styles.previewBanner}>
            <Ionicons name="eye-outline" size={16} color={Colors.warningStroke} />
            <Text style={styles.previewBannerText}>{myEmployee.name}님 급여 명세서 미리보기</Text>
          </View>
        )}

        <View style={styles.monthNav}>
          <TouchableOpacity onPress={prevMonth} style={styles.monthButton} hitSlop={8} accessibilityRole="button" accessibilityLabel="이전 달">
            <Ionicons name="chevron-back" size={18} color={Colors.gray600} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{year}년 {month}월</Text>
          <TouchableOpacity onPress={nextMonth} style={styles.monthButton} hitSlop={8} disabled={isCurrentMonth} accessibilityRole="button" accessibilityLabel="다음 달" accessibilityState={{ disabled: isCurrentMonth }}>
            <Ionicons name="chevron-forward" size={18} color={isCurrentMonth ? Colors.gray300 : Colors.gray600} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />
        ) : !payroll ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={28} color={Colors.gray300} />
            <Text style={styles.emptyText}>이 달은 아직 정산되지 않았어요</Text>
          </View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.netPay} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{fmt(payroll.net_pay)}</Text>
              <Text style={styles.summaryLine}>지급 {fmt(payroll.gross)} − 공제 {fmt(totalDeduction)}</Text>
              {(isPartTime || payroll.worked_minutes != null) && (
                <Text style={styles.summaryLine}>급여 작성 근무: {formatWorkedMinutes(payroll.worked_minutes)}</Text>
              )}
            </View>

            <Group title="지급 항목">
              <Row label="기본급" value={isPartTime ? payroll.gross - nonTaxable : (taxableBase || payroll.gross)} />
            </Group>

            {nonTaxable > 0 && (
              <Group title="비과세 항목">
                <Row label="비과세 수당" value={nonTaxable} />
              </Group>
            )}

            <Group title="공제 항목">
              {isPartTime ? (
                <Row label="원천징수 (3.3%)" value={payroll.withholding_tax} isDeduction />
              ) : (
                <>
                  <Row label="국민연금" value={payroll.national_pension} isDeduction />
                  <Row label="건강보험" value={payroll.health_insurance} isDeduction />
                  <Row label="장기요양보험" value={payroll.long_term_care} isDeduction />
                  <Row label="고용보험" value={payroll.employment_insurance} isDeduction />
                  <Row label="소득세" value={payroll.income_tax} isDeduction />
                  <Row label="지방소득세" value={payroll.local_income_tax} isDeduction />
                </>
              )}
              <Row label="공제 합계" value={totalDeduction} isDeduction isTotal />
            </Group>

            <Group title="실지급액">
              <Row label="실지급액" value={payroll.net_pay} isTotal />
            </Group>

            {nonTaxable > 0 && !isPartTime && (
              <Text style={styles.footnote}>
                비과세 {fmt(nonTaxable)}은 과세 대상에서 제외돼, 소득세·4대보험 산정 기준액은 {fmt(taxableBase)}이에요
              </Text>
            )}
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
  previewBannerText: { fontSize: 12, fontWeight: '500', color: Colors.warningStroke },

  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  monthButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 16, fontWeight: '700', color: Colors.black, minWidth: 96, textAlign: 'center' },

  summaryCard: { alignItems: 'center', gap: 6, padding: 20, backgroundColor: Colors.white, borderRadius: 24, borderWidth: 1, borderColor: Colors.homeBorder },
  netPay: { fontSize: 30, fontFamily: Fonts.spaceGroteskBold, fontWeight: '700', maxWidth: '100%', color: Colors.black, letterSpacing: -0.5 },
  summaryLine: { textAlign: 'center', fontSize: 12, fontWeight: '500', color: Colors.gray400 },

  group: { gap: 8 },
  groupTitle: { fontSize: 13, fontWeight: '700', color: Colors.gray600 },
  groupCard: {
    backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12, gap: 12,
    borderBottomWidth: 0.5, borderBottomColor: Colors.homeBorder,
  },
  rowTotal: { backgroundColor: Colors.gray50, borderBottomWidth: 0 },
  rowLeft: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: Colors.black },
  rowSub: { fontSize: 11, fontWeight: '400', color: Colors.gray400 },
  rowValue: { fontSize: 14, fontWeight: '700', color: Colors.black },
  rowValueNegative: { color: Colors.negative },

  footnote: { fontSize: 11, fontWeight: '400', color: Colors.gray400, lineHeight: 16 },

  empty: { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyText: { fontSize: 14, color: Colors.gray400 },
});
