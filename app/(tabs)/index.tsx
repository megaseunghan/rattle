import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useDashboard } from '../../lib/hooks/useDashboard';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { ErrorMessage } from '../../lib/components/ErrorMessage';

function StatCard({ emoji, label, value }: { emoji: string; label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({ emoji, label, onPress }: { emoji: string; label: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress}>
      <Text style={styles.quickEmoji}>{emoji}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const { store } = useAuth();
  const {
    monthlyOrderCount,
    lowStockCount,
    recipeCount,
    avgMarginRate,
    recentActivity,
    loading,
    error,
    refetch,
  } = useDashboard();

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 헤더 */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>안녕하세요 👋</Text>
            <Text style={styles.storeName}>{store?.name ?? '매장 이름'}</Text>
          </View>
          <View style={styles.logoDot} />
        </View>

        {/* 요약 카드 */}
        <View style={styles.statRow}>
          <StatCard emoji="📋" label="이번 달 발주" value={`${monthlyOrderCount}건`} />
          <StatCard emoji="⚠️" label="품절 임박" value={`${lowStockCount}개`} />
        </View>
        <View style={styles.statRow}>
          <StatCard emoji="🍳" label="레시피" value={`${recipeCount}개`} />
          <StatCard
            emoji="💰"
            label="평균 마진율"
            value={recipeCount > 0 ? `${avgMarginRate}%` : '-%'}
          />
        </View>

        {/* 빠른 실행 */}
        <Text style={styles.sectionTitle}>빠른 실행</Text>
        <View style={styles.quickRow}>
          <QuickAction emoji="📸" label="영수증 촬영" />
          <QuickAction emoji="➕" label="발주 추가" />
          <QuickAction emoji="📊" label="재고 확인" />
          <QuickAction emoji="🔗" label="POS 연동" />
        </View>

        {/* 최근 활동 */}
        <Text style={styles.sectionTitle}>최근 활동</Text>
        {recentActivity.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyText}>아직 활동이 없어요</Text>
            <Text style={styles.emptySubtext}>
              영수증을 촬영하거나 발주를 추가해보세요
            </Text>
          </View>
        ) : (
          <View style={styles.activityList}>
            {recentActivity.map(activity => (
              <View key={activity.id} style={styles.activityItem}>
                <Text style={styles.activityEmoji}>
                  {activity.type === 'order' ? '📋' : '🥬'}
                </Text>
                <View style={styles.activityContent}>
                  <Text style={styles.activityLabel}>{activity.label}</Text>
                  <Text style={styles.activityDate}>
                    {new Date(activity.created_at).toLocaleDateString('ko-KR')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray50,
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 14,
    color: Colors.gray500,
    marginBottom: 2,
  },
  storeName: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.black,
  },
  logoDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  statEmoji: {
    fontSize: 20,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.black,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 13,
    color: Colors.gray500,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.black,
    marginTop: 24,
    marginBottom: 12,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickAction: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  quickEmoji: {
    fontSize: 24,
    marginBottom: 6,
  },
  quickLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.gray700,
  },
  emptyState: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.gray700,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.gray400,
    textAlign: 'center',
  },
  activityList: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.gray100,
    overflow: 'hidden',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  activityEmoji: {
    fontSize: 20,
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.black,
    marginBottom: 2,
  },
  activityDate: {
    fontSize: 12,
    color: Colors.gray400,
  },
});
