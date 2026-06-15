import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

export type IntentTone = 'urgent' | 'warning' | 'info';

export interface IntentCardProps {
  tone: IntentTone;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss?: () => void;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}

const TONE: Record<IntentTone, { bg: string; fg: string; iconBg: string }> = {
  urgent: { bg: Colors.sentiment.negativeBg, fg: Colors.sentiment.negative, iconBg: '#FBD9D9' },
  warning: { bg: Colors.sentiment.neutralBg, fg: Colors.sentiment.neutral, iconBg: '#FBE6C2' },
  info: { bg: Colors.tinted, fg: Colors.primary, iconBg: Colors.bg },
};

/**
 * Intent-based Design — 사용자의 다음 행동을 선제 안내하는 의도 카드.
 * 홈 상단 가로 스크롤에 배치되며, tone으로 긴급도를 시각화한다.
 */
export function IntentCard({
  tone, icon, title, description, actionLabel, onAction, onDismiss, busy, style,
}: IntentCardProps) {
  const c = TONE[tone];
  return (
    <View style={[styles.card, { backgroundColor: c.bg }, style]}>
      <View style={styles.topRow}>
        <View style={[styles.iconWrap, { backgroundColor: c.iconBg }]}>
          <Ionicons name={icon} size={16} color={c.fg} />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.desc} numberOfLines={2}>{description}</Text>
        </View>
        {onDismiss && (
          <TouchableOpacity onPress={onDismiss} hitSlop={8} style={styles.dismissBtn}>
            <Ionicons name="close" size={16} color={Colors.gray400} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: c.fg }]}
        onPress={onAction}
        disabled={busy}
        activeOpacity={0.85}
      >
        {busy
          ? <ActivityIndicator size="small" color={Colors.white} />
          : <Text style={styles.actionText}>{actionLabel}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%', borderRadius: 16, padding: 14,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap: { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  textCol: { flex: 1 },
  dismissBtn: { padding: 2, marginTop: 2 },
  title: { fontSize: 14, fontWeight: '700', color: Colors.black },
  desc: { fontSize: 12, color: Colors.gray600, marginTop: 2, lineHeight: 16 },
  actionBtn: { borderRadius: 10, paddingVertical: 9, alignItems: 'center', marginTop: 10 },
  actionText: { fontSize: 13, fontWeight: '700', color: Colors.white },
});
