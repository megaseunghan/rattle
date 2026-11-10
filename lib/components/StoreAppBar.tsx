/* Hallmark · pre-emit critique: P4 H4 E3 S5 R4 V3 (static assessment; native verification pending) */
/* Hallmark · component: App Bar · genre: modern-minimal · design-system: DESIGN.md
 * Approved: glass, logo mark, 56pt surface, 20pt outer margins; native validation tracked separately. */
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
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
  const [focused, setFocused] = useState<'menu' | 'notifications' | null>(null);
  return <GlassCard style={styles.surface} contentStyle={styles.bar}>
    <Pressable onPress={onMenu} onFocus={() => setFocused('menu')} onBlur={() => setFocused(null)}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, focused === 'menu' && styles.focused]}
      accessibilityLabel="더보기" accessibilityRole="button">
      <AppIcon name="menu-outline" size={24} color={Colors.gray700} accessible={false} />
    </Pressable>
    <View style={styles.center} accessible accessibilityLabel={`Rattle, ${name}`}>
      <Image source={require('../../assets/Rattle_96x96.png')} style={styles.logo} resizeMode="contain" accessible={false} />
      <Text style={styles.separator} accessible={false} importantForAccessibility="no">|</Text>
      <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail" accessible={false}>{name}</Text>
    </View>
    <Pressable onPress={onNotifications} onFocus={() => setFocused('notifications')} onBlur={() => setFocused(null)}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, focused === 'notifications' && styles.focused]}
      accessibilityLabel={unreadCount > 0 ? `알림, 읽지 않은 알림 ${unreadCount}개` : '알림'} accessibilityRole="button">
      <AppIcon name="notifications-outline" size={24} color={Colors.gray700} accessible={false} />
      {unreadCount > 0 && <View style={styles.dot} accessible={false} />}
    </Pressable>
  </GlassCard>;
}

const styles = StyleSheet.create({
  surface: { margin: 20 },
  // GlassCard adds a 1pt border on each edge: 54pt content + 2pt border = 56pt surface.
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 5, minHeight: 54 },
  center: { flex: 1, minWidth: 0, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  button: { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  pressed: { backgroundColor: Colors.tinted },
  focused: { borderColor: Colors.action },
  logo: { width: 36, height: 36, flexShrink: 0 },
  separator: { fontSize: 18, color: Colors.gray300 },
  name: { flexShrink: 1, minWidth: 0, fontSize: 14, fontFamily: Fonts.wantedBold, color: Colors.gray700 },
  dot: { position: 'absolute', top: 7, right: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.negative, borderWidth: 1.5, borderColor: Colors.white },
});
