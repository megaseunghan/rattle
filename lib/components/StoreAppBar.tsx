/* design-system: DESIGN.md — shared home-style toolbar for the five store tabs */
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

interface StoreAppBarProps {
  name: string;
  unreadCount: number;
  includeTopInset?: boolean;
  onMenu: () => void;
  onStore: () => void;
  onNotifications: () => void;
  onProfile: () => void;
}

export function StoreAppBar({ name, unreadCount, includeTopInset = false, onMenu, onStore, onNotifications, onProfile }: StoreAppBarProps) {
  const content = <View style={styles.bar}>
    <View style={styles.side}>
      <TouchableOpacity onPress={onMenu} style={styles.button} accessibilityLabel="더보기" accessibilityRole="button">
        <Ionicons name="ellipsis-horizontal" size={20} color={Colors.gray600} />
      </TouchableOpacity>
    </View>
    <View style={styles.center}>
      <TouchableOpacity style={styles.store} onPress={onStore} activeOpacity={0.7} accessibilityLabel="매장 전환" accessibilityHint={`현재 매장 ${name}`} accessibilityRole="button">
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Ionicons name="chevron-down" size={14} color={Colors.gray500} style={styles.chevron} />
      </TouchableOpacity>
    </View>
    <View style={styles.right}>
      <TouchableOpacity onPress={onNotifications} style={styles.button} accessibilityLabel="알림" accessibilityRole="button">
        <Ionicons name="notifications-outline" size={20} color={Colors.gray600} />
        {unreadCount > 0 && <View style={styles.dot} />}
      </TouchableOpacity>
      <TouchableOpacity onPress={onProfile} style={styles.button} accessibilityLabel="마이페이지" accessibilityRole="button">
        <Ionicons name="person-circle-outline" size={22} color={Colors.gray600} />
      </TouchableOpacity>
    </View>
  </View>;
  return includeTopInset ? <SafeAreaView edges={['top']} style={styles.safeArea}>{content}</SafeAreaView> : content;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: Colors.glass.background },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 8, backgroundColor: Colors.glass.background },
  side: { width: 88 },
  center: { flex: 1, minWidth: 0, alignItems: 'center' },
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  store: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, minHeight: 44, maxWidth: '100%' },
  chevron: { position: 'absolute', right: 0 },
  right: { width: 88, flexDirection: 'row', alignItems: 'center' },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: Colors.black },
  dot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.negative, borderWidth: 1.5, borderColor: Colors.white },
});
