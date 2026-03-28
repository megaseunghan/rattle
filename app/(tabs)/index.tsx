import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { callOcrEdgeFunction } from '../../lib/services/ocr';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useDashboard } from '../../lib/hooks/useDashboard';
import { useTossSync } from '../../lib/hooks/useTossSync';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { ErrorMessage } from '../../lib/components/ErrorMessage';

function StatCard({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={22} color={Colors.primary} style={styles.statIcon} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress}>
      <Ionicons name={icon} size={26} color={Colors.primary} style={styles.quickIcon} />
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
  const { todaySales, todayOrderCount, loadTodaySales } = useTossSync();
  useFocusEffect(useCallback(() => { refetch(); loadTodaySales(); }, []));

  const [scanning, setScanning] = useState(false);

  async function handleScanReceipt() {
    Alert.alert('납품서 스캔', '이미지를 어떻게 가져올까요?', [
      {
        text: '카메라로 촬영',
        onPress: async () => {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            Alert.alert('권한 필요', '카메라 권한이 필요합니다. 설정에서 허용해주세요.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.8 });
          if (!result.canceled && result.assets[0].base64) {
            await processImage(result.assets[0].uri, result.assets[0].base64);
          }
        },
      },
      {
        text: '앨범에서 선택',
        onPress: async () => {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) {
            Alert.alert('권한 필요', '사진 접근 권한이 필요합니다. 설정에서 허용해주세요.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.8 });
          if (!result.canceled && result.assets[0].base64) {
            await processImage(result.assets[0].uri, result.assets[0].base64);
          }
        },
      },
      { text: '취소', style: 'cancel' },
    ]);
  }

  async function processImage(uri: string, _base64: string) {
    setScanning(true);
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const ocrText = await callOcrEdgeFunction(manipulated.base64!);
      router.push({
        pathname: '/orders/ocr-review',
        params: { imageUri: uri, ocrText },
      });
    } catch (e: any) {
      Alert.alert('OCR 오류', e.message);
    } finally {
      setScanning(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 헤더 */}
        <View style={styles.header}>
          <View>
            <View style={styles.greetingRow}>
              <Text style={styles.greeting}>안녕하세요</Text>
              <Ionicons name="hand-right-outline" size={14} color={Colors.gray500} />
            </View>
            <Text style={styles.storeName}>{store?.name ?? '매장 이름'}</Text>
          </View>
          <View style={styles.logoDot} />
        </View>

        {/* 요약 카드 */}
        <View style={styles.statRow}>
          <StatCard icon="document-text-outline" label="이번 달 발주" value={`${monthlyOrderCount}건`} />
          <StatCard icon="warning-outline" label="품절 임박" value={`${lowStockCount}개`} />
        </View>
        <View style={styles.statRow}>
          <StatCard icon="restaurant-outline" label="레시피" value={`${recipeCount}개`} />
          <StatCard
            icon="cash-outline"
            label="평균 마진율"
            value={recipeCount > 0 ? `${avgMarginRate}%` : '-%'}
          />
        </View>
        {todayOrderCount > 0 && (
          <View style={styles.statRow}>
            <StatCard
              icon="stats-chart-outline"
              label="오늘 매출 (POS)"
              value={`${todaySales.toLocaleString('ko-KR')}원`}
            />
            <StatCard icon="receipt-outline" label="오늘 주문 (POS)" value={`${todayOrderCount}건`} />
          </View>
        )}

        {/* 빠른 실행 */}
        <Text style={styles.sectionTitle}>빠른 실행</Text>
        <View style={styles.quickRow}>
          <QuickAction
            icon={scanning ? 'hourglass-outline' : 'camera-outline'}
            label={scanning ? '분석 중...' : '영수증 촬영'}
            onPress={handleScanReceipt}
          />
          <QuickAction icon="add-circle-outline" label="발주 추가" onPress={() => router.push('/orders/new')} />
          <QuickAction icon="bar-chart-outline" label="재고 확인" onPress={() => router.push('/(tabs)/stock')} />
          <QuickAction icon="link-outline" label="POS 연동" onPress={() => router.push('/settings/pos-sync')} />
        </View>

        {/* 최근 활동 */}
        <Text style={styles.sectionTitle}>최근 활동</Text>
        {recentActivity.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="mail-open-outline" size={40} color={Colors.gray400} style={styles.emptyIcon} />
            <Text style={styles.emptyText}>아직 활동이 없어요</Text>
            <Text style={styles.emptySubtext}>
              영수증을 촬영하거나 발주를 추가해보세요
            </Text>
          </View>
        ) : (
          <View style={styles.activityList}>
            {recentActivity.map(activity => (
              <View key={activity.id} style={styles.activityItem}>
                <Ionicons
                  name={activity.type === 'order' ? 'document-text-outline' : 'leaf-outline'}
                  size={20}
                  color={Colors.gray500}
                  style={styles.activityIcon}
                />
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
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  greeting: {
    fontSize: 14,
    color: Colors.gray500,
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
  statIcon: {
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
  quickIcon: {
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
  emptyIcon: {
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
  activityIcon: {
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
