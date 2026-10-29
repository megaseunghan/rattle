/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md · designed-as-app */
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import type { FinancialShareScope } from '../../types';
import { FINANCIAL_SHARE_OPTIONS } from '../utils/financialSharing';

export function FinancialSharingChoices({ value, onChange, disabled = false }: {
  value: FinancialShareScope | null; onChange: (value: FinancialShareScope) => void; disabled?: boolean;
}) {
  return <View style={{ gap: 12 }} accessibilityRole="radiogroup">
    {FINANCIAL_SHARE_OPTIONS.map(option => <Pressable key={option.value} disabled={disabled}
      accessibilityRole="radio" accessibilityLabel={option.title} accessibilityHint={option.description} accessibilityState={{ checked: value === option.value, disabled }}
      onPress={() => onChange(option.value)} style={({ pressed }) => [styles.card, value === option.value && styles.selected, pressed && { backgroundColor: Colors.focusBg }]}>
      <View style={{ flex: 1, gap: 6 }}><Text style={styles.title}>{option.title}</Text><Text style={styles.description}>{option.description}</Text></View>
      <Ionicons name={value === option.value ? 'radio-button-on' : 'radio-button-off'} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" size={22} color={value === option.value ? Colors.action : Colors.gray500} />
    </Pressable>)}
    <Text style={styles.caption}>사장님과 관리자는 항상 확인할 수 있어요. 다른 사람의 급여·공제·계좌와 관리자 상세 손익은 공유하지 않아요.</Text>
  </View>;
}
const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder, padding: 20, minHeight: 90 },
  selected: { borderColor: Colors.primary, backgroundColor: Colors.tinted },
  title: { fontSize: 16, fontWeight: '700', color: Colors.black },
  description: { fontSize: 13, lineHeight: 20, color: Colors.gray600 },
  caption: { fontSize: 12, lineHeight: 19, color: Colors.gray500 },
});
