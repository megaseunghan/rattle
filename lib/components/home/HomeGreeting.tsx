/*
 * S04 홈 인사말(2026-11-27 확정 시안 home-s04-final): 매장 근무가 없는 사람(연결된 직원 기록 없음)은
 * 출퇴근 칸 대신 알림 위에 인사말 한 줄과 직책을 보여 준다. 2026-11-28 사용자 결정.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { Radius, Type } from '../../../constants/designTokens';
import { useAuth } from '../../contexts/AuthContext';

const ROLE_LABELS = { owner: '사장님', manager: '점장', employee: '직원', part_timer: '파트타이머' } as const;
/** 한국 시각 기준 구간 경계. 매장 여는 시간을 저장하는 곳이 없어 시각으로만 나눈다. */
const OPEN_UNTIL_HOUR = 11;
const BUSINESS_UNTIL_HOUR = 21;
const KST_OFFSET_MS = 9 * 3600_000;

/** 한국 시각으로 인사말 문구를 고른다(시안: 오픈·영업 중·마감). */
export function greetingText(name: string | null, now: Date = new Date()): string {
  const hour = new Date(now.getTime() + KST_OFFSET_MS).getUTCHours();
  const message = hour < OPEN_UNTIL_HOUR ? '오픈 준비할 시간이에요'
    : hour < BUSINESS_UNTIL_HOUR ? '영업 중이에요' : '오늘도 수고했어요';
  return name ? `${name}님, ${message}` : message;
}

export function HomeGreeting() {
  const { user, storeRole } = useAuth();
  const rawName = user?.user_metadata?.full_name;
  const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : null;
  const role = storeRole ? ROLE_LABELS[storeRole] : null;
  return <View style={styles.root} accessibilityRole="header">
    <Text style={styles.text}>{greetingText(name)}</Text>
    {!!role && <Text style={styles.pill}>{role}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingTop: 4 },
  text: { flexShrink: 1, fontFamily: Fonts.wantedBold, fontSize: Type.lg, lineHeight: 24, color: Colors.black },
  pill: { fontFamily: Fonts.wantedMedium, fontSize: Type.base, lineHeight: 18, color: Colors.action, backgroundColor: Colors.tinted, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill, overflow: 'hidden' },
});
