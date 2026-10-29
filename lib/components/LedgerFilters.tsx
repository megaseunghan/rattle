import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CategoryManageButton } from './CategoryManageButton';
import { Colors } from '../../constants/colors';
export function LedgerFilters({ label, options, selected, onSelect, onManage }: { label: string; options: string[]; selected: string; onSelect: (value: string) => void; onManage?: () => void }) {
  return <View style={styles.root}><Text style={styles.label}>{label}</Text><View style={styles.row}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}>
      {options.map(option => <Pressable key={option} accessibilityRole="button" accessibilityLabel={`${label} ${option}`} accessibilityState={{ selected: selected === option }} onPress={() => onSelect(option)} style={({ pressed }) => [styles.chip, selected === option && styles.selected, pressed && { opacity: 0.7 }]}>
        <Text style={[styles.text, selected === option && styles.selectedText]}>{option}</Text>
      </Pressable>)}
    </ScrollView>
    {onManage && <CategoryManageButton label={`${label} 관리`} onPress={onManage} />}
  </View></View>;
}
const styles = StyleSheet.create({ root: { gap: 6 }, label: { fontSize: 12, color: Colors.gray600 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, options: { gap: 8 }, chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: Colors.glass.background, borderWidth: 1, borderColor: Colors.homeBorder, borderRadius: 14 }, selected: { backgroundColor: Colors.action, borderColor: Colors.action }, text: { fontSize: 13, color: Colors.gray700 }, selectedText: { color: Colors.white, fontWeight: '600' }, manage: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.glass.background, borderRadius: 14 } });
