import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { GlassCard } from './GlassCard';
import { NumericText } from './ui/NumericText';

/** Shared monthly structure for purchases and expenses. */
export function LedgerHeader({ year, month, onPrev, onNext, label, amount }: {
  year: number; month: number; onPrev: () => void; onNext: () => void; label: string; amount: string;
}) {
  return <GlassCard contentStyle={styles.content}>
    <View style={styles.navigation}>
      <Pressable accessibilityRole="button" accessibilityLabel="이전 달" onPress={onPrev} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Ionicons name="chevron-back" size={20} color={Colors.gray700} /></Pressable>
      <Text style={styles.month}>{year}년 {month}월</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="다음 달" onPress={onNext} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Ionicons name="chevron-forward" size={20} color={Colors.gray700} /></Pressable>
    </View>
    <Text style={styles.label}>{label}</Text><NumericText style={styles.amount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{amount}</NumericText>
  </GlassCard>;
}
const styles = StyleSheet.create({ content: { padding: 16, gap: 8 }, navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, button: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }, month: { color: Colors.gray800, fontSize: 15, fontWeight: '600' }, label: { color: Colors.gray600, fontSize: 13 }, amount: { color: Colors.black, fontSize: 28, fontWeight: '700' }, pressed: { opacity: 0.6 } });
