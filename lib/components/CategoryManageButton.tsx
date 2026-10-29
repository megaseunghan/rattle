import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

export function CategoryManageButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
    <Ionicons name="options-outline" size={20} color={Colors.action} accessible={false} />
  </Pressable>;
}
const styles = StyleSheet.create({ button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.glass.background, borderRadius: 14 } });
