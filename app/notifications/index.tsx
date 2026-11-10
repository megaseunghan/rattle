import { Fragment, useMemo, useRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { Spacing } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { AppBar, EmptyState } from '../../lib/components/ui';
import { NotificationSwipeRow } from '../../lib/components/NotificationSwipeRow';

function dayKey(iso: string) { return new Date(new Date(iso).getTime() + 9 * 3600000).toISOString().slice(0, 10); }
function dayLabel(key: string) {
  if (key === dayKey(new Date().toISOString())) return '오늘';
  if (key === dayKey(new Date(Date.now() - 86400000).toISOString())) return '어제';
  return `${Number(key.slice(5, 7))}월 ${Number(key.slice(8))}일`;
}
export default function NotificationsScreen() {
  const { notifications, loading, error, unreadCount, refetch, markRead, markAllRead, dismiss, deletingId } = useNotifications();
  const { user, store, currentRole, devPreviewMode } = useAuth();
  const scope = JSON.stringify([user?.id, store?.id, currentRole, devPreviewMode]);
  const deleting = useRef(false);
  const scrollGesture = useMemo(() => Gesture.Native(), []);
  async function deleteNotification(id: string) {
    if (deleting.current || deletingId || devPreviewMode !== 'self') return false;
    deleting.current = true;
    try { return await dismiss(id); }
    finally { deleting.current = false; }
  }
  const dayKeys = notifications.map(n => dayKey(n.created_at));
  return <SafeAreaView style={styles.container}>
    <AppBar title="알림" onBack={() => router.back()} rightSlot={unreadCount > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="모두 읽음" disabled={!!deletingId} accessibilityState={{ disabled: !!deletingId }} onPress={() => { void markAllRead(); }} style={styles.allRead}><Text style={styles.allReadText}>모두 읽음</Text></Pressable> : undefined} />
    <GestureDetector gesture={scrollGesture}><ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {error && <ErrorMessage message={error} onRetry={() => { void refetch(); }} />}
      {loading && notifications.length === 0 ? <ActivityIndicator color={Colors.action} style={styles.loading} />
        : notifications.length === 0 ? <EmptyState icon="notifications-outline" title="새로운 알림이 없어요" description="새로운 소식이 오면 이곳에 모여요" />
        : notifications.map((n, index) => <Fragment key={`${scope}:${n.id}`}>
          {(index === 0 || dayKeys[index] !== dayKeys[index - 1]) && <Text accessibilityRole="header" style={styles.day}>{dayLabel(dayKeys[index])}</Text>}
          <NotificationSwipeRow item={n} disabled={!!deletingId} onDeleteRequest={() => deleteNotification(n.id)} scrollGesture={scrollGesture}
            onPress={() => { if (!n.is_read) void markRead(n.id); if (n.category === 'members') router.push('/settings/members'); }} />
        </Fragment>)}
    </ScrollView></GestureDetector>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas }, scroll: { paddingHorizontal: Spacing.screenX, paddingTop: 12, paddingBottom: 40 },
  day: { color: Colors.gray600, fontFamily: Fonts.wantedMedium, fontSize: 11, lineHeight: 18, paddingTop: 12, paddingBottom: 3 },
  allRead: { minHeight: 44, paddingLeft: 10, justifyContent: 'center' }, allReadText: { color: Colors.action, fontSize: 12, fontFamily: Fonts.wantedMedium }, loading: { marginTop: 32 },
});
