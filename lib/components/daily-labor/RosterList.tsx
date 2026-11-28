/* design-system: DESIGN.md — S54 '명단' 탭. 일용근로자는 합류하지 않고 매장이 직접 추가한다(하단 고정 버튼은 화면이 둔다). */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { CardStyle, Type } from '../../../constants/designTokens';
import { AppIcon } from '../../icons/AppIcon';
import { EmptyState } from '../ui/EmptyState';
import { won } from './format';
import type { DailyLaborer } from '../../../types';

interface RosterListProps {
  laborers: DailyLaborer[];
  onOpen: (laborerId: string) => void;
}

function wageText(laborer: DailyLaborer): string {
  const weekday = laborer.weekday_wage != null ? won(laborer.weekday_wage) : '미정';
  const weekend = laborer.weekend_wage != null ? won(laborer.weekend_wage) : '평일과 같음';
  return `평일 ${weekday} · 주말 ${weekend}`;
}

export function RosterList({ laborers, onOpen }: RosterListProps) {
  if (!laborers.length) return <EmptyState icon="people-outline" title="아직 명단이 없어요" description="아래 ‘일용근로자 추가’로 이름과 일당을 적어 주세요." />;
  return (
    <View style={styles.card}>
      {laborers.map((laborer, index) => (
        <Pressable key={laborer.id} accessibilityRole="button" accessibilityLabel={`${laborer.name}, ${wageText(laborer)}${laborer.is_active ? '' : ', 일 안 함'}`}
          onPress={() => onOpen(laborer.id)} style={[styles.row, index > 0 && styles.divider]}>
          <View style={[styles.avatar, !laborer.is_active && styles.inactive]}><Text style={styles.avatarText}>{laborer.name.slice(0, 1)}</Text></View>
          <View style={styles.main}>
            <Text style={[styles.name, !laborer.is_active && styles.nameInactive]} numberOfLines={1}>{laborer.name}{laborer.is_active ? '' : ' · 일 안 함'}</Text>
            <Text style={styles.sub} numberOfLines={1}>{wageText(laborer)}</Text>
          </View>
          <AppIcon name="chevron-forward" size={16} color={Colors.gray400} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...CardStyle, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: Colors.hairline },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.chipBg, alignItems: 'center', justifyContent: 'center' },
  inactive: { opacity: 0.5 },
  avatarText: { fontSize: Type.base, fontWeight: '700', color: Colors.gray600 },
  main: { flex: 1, gap: 2 },
  name: { fontSize: Type.md, fontWeight: '700', color: Colors.black },
  nameInactive: { color: Colors.gray500 },
  sub: { fontSize: Type.xs + 1, color: Colors.gray500 },
});
