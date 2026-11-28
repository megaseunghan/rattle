/* design-system: DESIGN.md — S54 '지급 완료' 탭. 지급일·사람·지급 방법·실수령. 눌러서 내역을 본다. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { CardStyle, Type } from '../../../constants/designTokens';
import { EmptyState } from '../ui/EmptyState';
import { NumericText } from '../ui/NumericText';
import { METHOD_LABEL } from './PaymentDetailSheet';
import { dayLabel, won } from './format';
import type { DailyLaborPayment } from '../../../types';

interface PaidListProps {
  payments: DailyLaborPayment[];
  nameOf: (laborerId: string) => string;
  daysOf: (paymentId: string) => number;
  onOpen: (payment: DailyLaborPayment) => void;
}

export function PaidList({ payments, nameOf, daysOf, onOpen }: PaidListProps) {
  if (!payments.length) return <EmptyState icon="checkmark-circle-outline" title="지급 완료한 기록이 없어요" description="지급 대기에서 기록을 골라 지급 완료로 바꿀 수 있어요." />;
  const sorted = [...payments].sort((a, b) => b.paid_on.localeCompare(a.paid_on) || b.created_at.localeCompare(a.created_at));
  return (
    <View style={styles.card}>
      {sorted.map((payment, index) => (
        <Pressable key={payment.id} accessibilityRole="button" onPress={() => onOpen(payment)}
          accessibilityLabel={`${dayLabel(payment.paid_on)} ${nameOf(payment.laborer_id)} ${METHOD_LABEL[payment.payment_method]} 실수령 ${won(payment.net_pay)}`}
          style={[styles.row, index > 0 && styles.divider]}>
          <View style={styles.main}>
            <Text style={styles.date}>{dayLabel(payment.paid_on)}</Text>
            <Text style={styles.sub} numberOfLines={1}>{nameOf(payment.laborer_id)} · {daysOf(payment.id)}일</Text>
          </View>
          <View style={styles.tag}><Text style={styles.tagText}>{METHOD_LABEL[payment.payment_method]}</Text></View>
          <View style={styles.side}>
            <NumericText style={styles.amount}>{won(payment.net_pay)}</NumericText>
            <Text style={styles.caption}>실수령</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...CardStyle, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: Colors.hairline },
  main: { flex: 1, gap: 2 },
  date: { fontSize: Type.md, fontWeight: '700', color: Colors.black },
  sub: { fontSize: Type.xs + 1, color: Colors.gray500 },
  tag: { backgroundColor: Colors.chipBg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  tagText: { fontSize: Type.xs, fontWeight: '600', color: Colors.gray600 },
  side: { alignItems: 'flex-end' },
  amount: { fontSize: Type.md, fontWeight: '700', color: Colors.black },
  caption: { fontSize: Type.xs, color: Colors.gray400 },
});
