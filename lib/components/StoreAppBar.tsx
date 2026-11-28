/* design-system: DESIGN.md 「S04 매장 홈 시안 확정」 — 상단 바. 2026-11-28부터 떠 있는 글래스 대신
 * 바탕과 같은 회색의 평평한 56pt 줄(로고 28 + 매장 이름 16 굵게, 구분선 없음). */
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../icons/AppIcon';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';

interface StoreAppBarProps {
  name: string;
  unreadCount: number;
  onMenu: () => void;
  onNotifications: () => void;
}

/** The tab shell owns this toolbar: it stays in place while only page contents move. */
export function StoreAppBar({ name, unreadCount, onMenu, onNotifications }: StoreAppBarProps) {
  const [focused, setFocused] = useState<'menu' | 'notifications' | null>(null);
  return <View style={styles.bar}>
    <Pressable onPress={onMenu} onFocus={() => setFocused('menu')} onBlur={() => setFocused(null)}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, focused === 'menu' && styles.focused]}
      accessibilityLabel="더보기" accessibilityRole="button">
      <AppIcon name="menu-outline" size={24} color={Colors.gray700} accessible={false} />
    </Pressable>
    <View style={styles.center} accessible accessibilityLabel={`Rattle, ${name}`}>
      <Image source={require('../../assets/Rattle_96x96.png')} style={styles.logo} resizeMode="contain" accessible={false} />
      <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail" accessible={false}>{name}</Text>
    </View>
    <Pressable onPress={onNotifications} onFocus={() => setFocused('notifications')} onBlur={() => setFocused(null)}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, focused === 'notifications' && styles.focused]}
      accessibilityLabel={unreadCount > 0 ? `알림, 읽지 않은 알림 ${unreadCount}개` : '알림'} accessibilityRole="button">
      <AppIcon name="notifications-outline" size={24} color={Colors.gray700} accessible={false} />
      {unreadCount > 0 && <View style={styles.dot} accessible={false} />}
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, height: 56, backgroundColor: Colors.homeCanvas },
  center: { flex: 1, minWidth: 0, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  button: { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  pressed: { backgroundColor: Colors.tinted },
  focused: { borderColor: Colors.action },
  logo: { width: 28, height: 28, flexShrink: 0 },
  name: { flexShrink: 1, minWidth: 0, fontSize: 16, fontFamily: Fonts.wantedBold, color: Colors.black },
  dot: { position: 'absolute', top: 7, right: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.negative, borderWidth: 1.5, borderColor: Colors.white },
});
