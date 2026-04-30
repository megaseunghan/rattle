import { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useDashboard } from '../../lib/hooks/useDashboard';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { ErrorMessage } from '../../lib/components/ErrorMessage';

function StatCard({
  icon,
  label,
  value,
  onPress,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
  accent?: boolean;
}) {
  const content = (
    <>
      <View style={[styles.statIconBg, accent && styles.statIconBgAccent]}>
        <Ionicons name={icon} size={20} color={accent ? Colors.dark : Colors.primary} />
      </View>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.statCard, accent && styles.statCardAccent]}
        onPress={onPress}
        activeOpacity={0.75}
      >
        {content}
      </TouchableOpacity>
    );
  }
  return (
    <View style={[styles.statCard, accent && styles.statCardAccent]}>
      {content}
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.quickIconBg}>
        <Ionicons name={icon} size={24} color={Colors.primary} />
      </View>
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
    estimatedConsumptions,
    loading,
    error,
    refetch,
  } = useDashboard();
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 헤더 */}
        <View style={styles.header}>
          <View>
            <Text style={styles.storeName}>{store?.name ?? '매장 이름'}</Text>
          </View>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => router.push('/settings/profile')}
          >
            <Ionicons name="person-outline" size={18} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* 요약 카드 */}
        <View style={styles.statRow}>
          <StatCard
            icon="document-text-outline"
            label="이번 달 발주"
            value={`${monthlyOrderCount}건`}
            onPress={() => router.push('/(tabs)/orders')}
          />
          <StatCard
            icon="warning-outline"
            label="품절 임박"
            value={`${lowStockCount}개`}
            onPress={() => router.push('/(tabs)/stock')}
          />
        </View>
        <View style={styles.statRow}>
          <StatCard
            icon="restaurant-outline"
            label="레시피"
            value={`${recipeCount}개`}
            onPress={() => router.push('/(tabs)/recipes')}
          />
          <StatCard
            icon="cash-outline"
            label="평균 마진율"
            value={recipeCount > 0 ? `${avgMarginRate}%` : '-%'}
            onPress={() => router.push({ pathname: '/(tabs)/recipes', params: { sort: 'margin' } })}
          />
        </View>
        {estimatedConsumptions.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>예상 재고 소진량 (오늘)</Text>
            <View style={styles.consumptionCard}>
              {estimatedConsumptions.map((item, index) => (
                <View
                  key={item.ingredientName}
                  style={[
                    styles.consumptionRow,
                    index === estimatedConsumptions.length - 1 && styles.consumptionRowLast,
                  ]}
                >
                  <Text style={styles.consumptionName}>{item.ingredientName}</Text>
                  <Text style={styles.consumptionAmount}>
                    {item.amount}{item.unit}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* 빠른 실행 */}
        <Text style={styles.sectionTitle}>빠른 실행</Text>
        <View style={styles.quickRow}>
          <QuickAction icon="camera-outline" label="납품서 스캔" onPress={() => router.push('/(tabs)/orders')} />
          <QuickAction icon="add-circle-outline" label="발주 추가" onPress={() => router.push('/orders/new')} />
          <QuickAction icon="bar-chart-outline" label="재고 확인" onPress={() => router.push('/(tabs)/stock')} />
          <QuickAction icon="link-outline" label="POS 연동" onPress={() => router.push('/(tabs)/pos')} />
        </View>

        {/* 최근 활동 */}
        <Text style={styles.sectionTitle}>최근 활동</Text>
        {recentActivity.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBg}>
              <Ionicons name="mail-open-outline" size={26} color={Colors.gray400} />
            </View>
            <Text style={styles.emptyText}>아직 활동이 없어요</Text>
            <Text style={styles.emptySubtext}>영수증을 촬영하거나 발주를 추가해보세요</Text>
          </View>
        ) : (
          <View style={styles.activityList}>
            {recentActivity.map((activity, index) => (
              <View
                key={activity.id}
                style={[
                  styles.activityItem,
                  index === recentActivity.length - 1 && styles.activityItemLast,
                ]}
              >
                <View style={[
                  styles.activityIconCircle,
                  { backgroundColor: activity.type === 'order' ? Colors.info + '18' : Colors.primary + '18' },
                ]}>
                  <Ionicons
                    name={activity.type === 'order' ? 'document-text-outline' : 'leaf-outline'}
                    size={16}
                    color={activity.type === 'order' ? Colors.info : Colors.primary}
                  />
                </View>
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
    paddingBottom: 48,
  },

  // 헤더
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
    fontSize: 24,
    fontWeight: '800',
    color: Colors.black,
    letterSpacing: -0.5,
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.tinted,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // 스탯 카드
  statRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statCardAccent: {
    backgroundColor: Colors.tinted,
  },
  statIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.tinted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statIconBgAccent: {
    backgroundColor: Colors.pale + '60',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.black,
    marginBottom: 3,
    letterSpacing: -0.5,
  },
  statValueAccent: {
    color: Colors.deeper,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.gray500,
    fontWeight: '500',
  },

  // 빠른 실행
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.black,
    marginTop: 28,
    marginBottom: 14,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  quickIconBg: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  quickLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.gray600,
    textAlign: 'center',
  },

  // 최근 활동
  emptyState: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  emptyIconBg: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: Colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.gray700,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.gray400,
    textAlign: 'center',
    lineHeight: 18,
  },
  activityList: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  activityItemLast: {
    borderBottomWidth: 0,
  },
  activityIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
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

  // 예상 소진량
  consumptionCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  consumptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  consumptionRowLast: {
    borderBottomWidth: 0,
  },
  consumptionName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.black,
  },
  consumptionAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
});
