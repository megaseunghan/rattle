import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/designTokens';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { AppNotification, NotificationCategory } from '../../types';
import { AppBar, EmptyState } from '../../lib/components/ui';

type FilterKey = 'all' | NotificationCategory;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'attendance', label: '근태' },
  { key: 'stock', label: '재고' },
  { key: 'sales', label: '매출' },
];

const CATEGORY_ICON: Record<NotificationCategory, keyof typeof Ionicons.glyphMap> = {
  attendance: 'time-outline',
  stock: 'cube-outline',
  sales: 'stats-chart-outline',
};

function iconBg(n: AppNotification): string {
  if (n.type === 'late') return Colors.negativeBg;
  if (n.type === 'no_show') return Colors.warningBg;
  return Colors.gray100;
}

function iconColor(n: AppNotification): string {
  if (n.type === 'late') return Colors.negative;
  if (n.type === 'no_show') return Colors.warningStroke;
  return Colors.gray500;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day === 1) return '어제';
  return `${day}일 전`;
}

function NotificationRow({ item, onPress }: { item: AppNotification; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.row, !item.is_read && styles.rowUnread]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconBg(item) }]}>
        <Ionicons name={CATEGORY_ICON[item.category]} size={17} color={iconColor(item)} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, !item.is_read && styles.rowTitleUnread]} numberOfLines={2}>{item.message}</Text>
        <Text style={styles.rowTime}>{relativeTime(item.created_at)}</Text>
      </View>
      {!item.is_read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const { notifications, loading, unreadCount, refetch, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => { refetch(); }, [refetch]);

  const filtered = filter === 'all' ? notifications : notifications.filter(n => n.category === filter);

  function handlePress(n: AppNotification) {
    if (!n.is_read) markRead(n.id);
  }

  return (
    <SafeAreaView style={styles.container}>
      <AppBar
        title="알림"
        onBack={() => router.back()}
        rightActionLabel={unreadCount > 0 ? '모두 읽음' : undefined}
        onRightActionPress={markAllRead}
      />

      <View style={styles.chipRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="notifications-outline" title="새로운 알림이 없어요" description="근태, 재고, 매출 알림이 오면 이곳에 모여요" />
        ) : (
          filtered.map(n => <NotificationRow key={n.id} item={n} onPress={() => handlePress(n)} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.screenX, paddingTop: 12 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: Colors.gray200 },
  chipActive: { backgroundColor: Colors.black, borderColor: Colors.black },
  chipText: { fontSize: 12, fontWeight: '500', color: Colors.gray600 },
  chipTextActive: { color: Colors.white, fontWeight: '600' },

  scroll: { padding: Spacing.screenX, paddingBottom: 40, gap: 4 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, paddingHorizontal: 10, paddingVertical: 12,
  },
  rowUnread: { backgroundColor: Colors.tinted },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 13, fontWeight: '500', color: Colors.gray600, lineHeight: 18 },
  rowTitleUnread: { fontWeight: '600', color: Colors.black },
  rowTime: { fontSize: 11, fontWeight: '400', color: Colors.gray400 },
  unreadDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.primary },
});
