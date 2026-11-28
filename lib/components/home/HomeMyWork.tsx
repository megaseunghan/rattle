/* S04 홈 '내 근무'(2026-11-27 확정 시안): 3열 타일, 바탕은 회색 그대로이고 아이콘에만 파랑·초록·주황. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { CardStyle, Type } from '../../../constants/designTokens';
import { AppIcon } from '../../icons/AppIcon';
import { HomeSectionHeader } from './HomeSectionHeader';
import { TILE_TONES, type TileTone } from './tasks/taskTiles';

interface Shortcut { id: string; title: string; description: string; icon: keyof typeof AppIcon.glyphMap; tone: TileTone; route: string }
const SHORTCUTS: Shortcut[] = [
  { id: 'schedule', title: '내 스케줄', description: '내 고정 근무', icon: 'calendar-outline', tone: 'blue', route: '/mypage/schedule' },
  { id: 'payslip', title: '내 급여', description: '월별 명세', icon: 'wallet-outline', tone: 'green', route: '/mypage/payslip' },
  { id: 'attendance', title: '근태', description: '출퇴근 기록', icon: 'time-outline', tone: 'orange', route: '/attendance/my-qr' },
];

export function HomeMyWork() {
  return <View style={styles.root}>
    <HomeSectionHeader title="내 근무" />
    <View style={styles.card}>
      {SHORTCUTS.map(item => {
        const tone = TILE_TONES[item.tone];
        return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.description}`}
          onPress={() => router.push(item.route as never)} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
          <View style={[styles.icon, { backgroundColor: tone.background }]}><AppIcon name={item.icon} size={22} color={tone.color} accessible={false} /></View>
          <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: 4 },
  card: { ...CardStyle, padding: 14, flexDirection: 'row', gap: 8 },
  tile: { flex: 1, minWidth: 0, minHeight: 104, padding: 12, borderRadius: 16, backgroundColor: Colors.gray50, gap: 2 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 'auto' },
  description: { marginTop: 10, fontFamily: Fonts.wantedRegular, fontSize: 12, lineHeight: 16, color: Colors.gray500 },
  title: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.md, lineHeight: 20, color: Colors.black },
  pressed: { opacity: 0.7 },
});
