/* design-system: DESIGN.md — S54 사람 화면. 일당·급여 계좌(끝 4자리 + 계좌 보기)·이번 달 근무 기록. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Type } from '../../../constants/designTokens';
import { AppIcon } from '../../icons/AppIcon';
import { maskedAccount } from '../../services/accountNumbers';
import { NumericText } from '../ui/NumericText';
import { dayLabel, won } from './format';
import { GrayNote, StatusPill } from './parts';
import type { DailyLaborEntry, DailyLaborer } from '../../../types';

interface PersonViewProps {
  laborer: DailyLaborer;
  entries: DailyLaborEntry[];
  month: number;
  revealedAccount: string | null;
  showInsuranceNotice: boolean;
  onEdit: () => void;
  onToggleAccount: () => void;
  onOpenEntry: (entry: DailyLaborEntry) => void;
}

function InfoRow({ label, value, onPress, muted }: { label: string; value: string; onPress?: () => void; muted?: boolean }) {
  const content = <>
    <Text style={styles.key}>{label}</Text>
    <NumericText style={[styles.value, muted && styles.muted]} numberOfLines={1}>{value}</NumericText>
    {onPress && <AppIcon name="chevron-forward" size={16} color={Colors.gray400} />}
  </>;
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${value}, 고치기`} onPress={onPress} style={styles.row}>{content}</Pressable>;
}

export function PersonView({ laborer, entries, month, revealedAccount, showInsuranceNotice, onEdit, onToggleAccount, onOpenEntry }: PersonViewProps) {
  const sorted = [...entries].sort((a, b) => b.work_date.localeCompare(a.work_date));
  const hasAccount = !!laborer.account_last4;
  return (
    <View style={styles.wrap}>
      {!!laborer.phone && <Text style={styles.phone}>{laborer.phone}</Text>}
      {!laborer.is_active && <GrayNote text="일 안 하는 사람으로 바꿔 두었어요. 근무를 기록하려면 정보에서 다시 일하는 사람으로 바꿔 주세요." />}

      <Text style={styles.section}>일당</Text>
      <InfoRow label="평일" value={laborer.weekday_wage != null ? won(laborer.weekday_wage) : '아직 안 정했어요'} muted={laborer.weekday_wage == null} onPress={onEdit} />
      <InfoRow label="주말" value={laborer.weekend_wage != null ? won(laborer.weekend_wage) : '평일과 같아요'} muted={laborer.weekend_wage == null} onPress={onEdit} />

      <Text style={styles.section}>급여 계좌</Text>
      {hasAccount ? <>
        <InfoRow label={laborer.bank_name ?? '은행 미정'} value={revealedAccount ?? maskedAccount(laborer.account_last4) ?? ''} />
        <Pressable accessibilityRole="button" onPress={onToggleAccount} style={styles.reveal}>
          <Text style={styles.revealText}>{revealedAccount ? '계좌 숨기기' : '계좌 보기'}</Text>
        </Pressable>
      </> : <InfoRow label={laborer.bank_name ?? '계좌'} value="아직 안 정했어요" muted onPress={onEdit} />}

      <Text style={styles.section}>{month}월 근무 · {entries.length}일</Text>
      {sorted.length === 0 && <Text style={styles.empty}>이번 달 근무 기록이 없어요.</Text>}
      {sorted.map(entry => {
        const note = [entry.extra_pay ? `추가 ${won(entry.extra_pay)}` : '', entry.memo ?? ''].filter(Boolean).join(' · ');
        return (
          <Pressable key={entry.id} accessibilityRole="button" onPress={() => onOpenEntry(entry)} style={styles.entry}
            accessibilityLabel={`${dayLabel(entry.work_date)} ${won(entry.gross)} ${entry.payment_id ? '지급 완료' : '지급 대기'}`}>
            <View style={styles.entryMain}>
              <Text style={[styles.entryDate, !!entry.payment_id && styles.paidText]}>{dayLabel(entry.work_date)}{entry.is_weekend ? ' · 주말' : ''}</Text>
              {!!note && <Text style={styles.note} numberOfLines={1}>{note}</Text>}
            </View>
            <NumericText style={[styles.entryAmount, !!entry.payment_id && styles.paidText]}>{won(entry.gross)}</NumericText>
            <StatusPill paid={!!entry.payment_id} />
          </Pressable>
        );
      })}
      {showInsuranceNotice && <Text style={styles.insurance}>한 달에 8일 이상 일하면 국민연금·건강보험 가입 대상일 수 있어요.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  phone: { fontSize: Type.base, color: Colors.gray500, marginBottom: 8 },
  section: { fontSize: Type.sm, fontWeight: '600', color: Colors.gray500, marginTop: 24, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.hairline },
  key: { fontSize: Type.md, fontWeight: '500', color: Colors.black },
  value: { flex: 1, textAlign: 'right', fontSize: Type.md, fontWeight: '700', color: Colors.black },
  muted: { color: Colors.gray400, fontWeight: '500' },
  reveal: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  revealText: { fontSize: Type.sm, fontWeight: '600', color: Colors.action },
  empty: { fontSize: Type.sm, color: Colors.gray500, paddingVertical: 12 },
  entry: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.hairline },
  entryMain: { flex: 1, gap: 2 },
  entryDate: { fontSize: Type.md, fontWeight: '600', color: Colors.black },
  paidText: { color: Colors.gray500 },
  note: { fontSize: Type.xs + 1, color: Colors.gray500 },
  entryAmount: { fontSize: Type.md, fontWeight: '600', color: Colors.black },
  insurance: { fontSize: Type.xs + 1, color: Colors.gray500, marginTop: 12, lineHeight: 17 },
});
