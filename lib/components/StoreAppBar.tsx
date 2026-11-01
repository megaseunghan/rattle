/* design-system: DESIGN.md — shared home-style toolbar for the five store tabs */
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '../icons/AppIcon';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { GlassCard } from './GlassCard';

interface StoreAppBarProps {
  name: string;
  unreadCount: number;
  onMenu: () => void;
  onNotifications: () => void;
}

/** The tab shell owns this toolbar: it stays in place while only page contents move. */
export function StoreAppBar({ name, unreadCount, onMenu, onNotifications }: StoreAppBarProps) {
  return <GlassCard style={styles.surface} contentStyle={styles.bar}>
    <View style={styles.side}>
      <TouchableOpacity onPress={onMenu} style={styles.button} accessibilityLabel="더보기" accessibilityRole="button">
        <AppIcon name="menu-outline" size={26} color={Colors.gray700} />
      </TouchableOpacity>
    </View>
    <View style={styles.center}>
      <Text style={styles.logo} accessibilityLabel="Rattle"><Text style={styles.logoInitial}>R</Text>attle<Text style={styles.logoInitial}>.</Text></Text>
      <Text style={styles.name} numberOfLines={1}>{name}</Text>
    </View>
    <View style={styles.side}>
      <TouchableOpacity onPress={onNotifications} style={styles.button} accessibilityLabel="알림" accessibilityRole="button">
        <AppIcon name="notifications-outline" size={20} color={Colors.gray600} />
        {unreadCount > 0 && <View style={styles.dot} />}
      </TouchableOpacity>
    </View>
  </GlassCard>;
}

const styles = StyleSheet.create({
  surface: { marginHorizontal: 12 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6, minHeight: 64 },
  side: { width: 44 },
  center: { flex: 1, minWidth: 0, alignItems: 'center' },
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  logo: { fontFamily: Fonts.wantedBold, fontSize: 23, lineHeight: 28, letterSpacing: -0.8, color: Colors.black },
  logoInitial: { color: Colors.primary },
  name: { maxWidth: '100%', fontSize: 12, color: Colors.gray600, marginTop: 1 },
  dot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.negative, borderWidth: 1.5, borderColor: Colors.white },
});
