import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { callOcrEdgeFunction } from '../../lib/services/ocr';
import { Colors } from '../../constants/colors';
import { useOrders } from '../../lib/hooks/useOrders';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { OrderWithItems } from '../../lib/services/orders';
import { Order } from '../../types';

const STATUS_LABELS: Record<Order['status'], string> = {
  pending: '대기',
  confirmed: '확정',
  delivered: '입고완료',
};

const STATUS_COLORS: Record<Order['status'], string> = {
  pending: Colors.warning,
  confirmed: Colors.info,
  delivered: Colors.success,
};

function OrderCard({
  order,
  onDeliver,
  onDelete,
}: {
  order: OrderWithItems;
  onDeliver: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  function handleDeliver() {
    const priceChanges = order.order_items
      .filter(item => item.ingredient && item.ingredient.last_price > 0)
      .filter(item => item.unit_price !== item.ingredient!.last_price)
      .map(item => {
        const prev = item.ingredient!.last_price;
        const next = item.unit_price;
        const diff = next - prev;
        const pct = ((diff / prev) * 100).toFixed(1);
        const sign = diff > 0 ? '+' : '';
        return `• ${item.ingredient!.name}: ${prev.toLocaleString('ko-KR')}원 → ${next.toLocaleString('ko-KR')}원 (${sign}${pct}%)`;
      });

    const message = priceChanges.length > 0
      ? `⚠️ 가격 변동 감지\n${priceChanges.join('\n')}\n\n입고 시 위 단가로 재고 단가가 업데이트됩니다.`
      : '발주를 입고 완료로 처리하면 재고가 자동으로 업데이트됩니다.';

    Alert.alert('입고 처리', message, [
      { text: '취소', style: 'cancel' },
      { text: '입고 처리', onPress: () => onDeliver(order.id) },
    ]);
  }

  function handleDelete() {
    Alert.alert('발주 삭제', '이 발주를 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => onDelete(order.id) },
    ]);
  }

  const statusColor = STATUS_COLORS[order.status];

  return (
    <TouchableOpacity
      style={[styles.orderCard, { borderLeftColor: statusColor }]}
      onPress={() => router.push(`/orders/${order.id}`)}
      activeOpacity={0.75}
    >
      <View style={styles.orderCardHeader}>
        <View style={styles.orderCardLeft}>
          <Text style={styles.supplierName}>{order.supplier_name || '(거래처 미입력)'}</Text>
          <Text style={styles.orderDate}>{order.order_date}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {STATUS_LABELS[order.status]}
          </Text>
        </View>
      </View>

      <View style={styles.orderCardFooter}>
        <View>
          <Text style={styles.totalAmount}>
            {order.total_amount.toLocaleString('ko-KR')}원
          </Text>
          <Text style={styles.itemCount}>{order.order_items.length}개 품목</Text>
        </View>
        <View style={styles.orderActions}>
          {order.status !== 'delivered' && (
            <TouchableOpacity style={styles.deliverButton} onPress={handleDeliver}>
              <Ionicons name="checkmark" size={14} color={Colors.white} />
              <Text style={styles.deliverButtonText}>입고</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={14} color={Colors.gray500} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function OrdersScreen() {
  const { data, loading, loadingMore, hasMore, loadMore, error, refetch, deliver, remove } = useOrders();
  const [scanning, setScanning] = useState(false);
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

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
            await processImages([{ uri: result.assets[0].uri, base64: result.assets[0].base64 }]);
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
          const result = await ImagePicker.launchImageLibraryAsync({
            base64: true,
            quality: 0.8,
            allowsMultipleSelection: true,
          });
          if (!result.canceled && result.assets.length > 0) {
            const assets = result.assets.filter(a => a.base64) as Array<{ uri: string; base64: string }>;
            if (assets.length > 0) await processImages(assets);
          }
        },
      },
      { text: '취소', style: 'cancel' },
    ]);
  }

  async function processImages(assets: Array<{ uri: string; base64: string }>) {
    setScanning(true);
    try {
      const allItems: unknown[] = [];
      for (const asset of assets) {
        const manipulated = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 1200 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        const ocrText = await callOcrEdgeFunction(manipulated.base64!);
        const parsed = JSON.parse(ocrText);
        if (Array.isArray(parsed)) allItems.push(...parsed);
      }
      router.push({
        pathname: '/orders/ocr-review',
        params: { imageUri: assets[0].uri, ocrText: JSON.stringify(allItems) },
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
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>발주</Text>
          {data.length > 0 && <Text style={styles.subtitle}>{data.length}건</Text>}
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.scanButton, scanning && styles.scanButtonDisabled]}
            onPress={handleScanReceipt}
            disabled={scanning}
          >
            {scanning
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name="camera-outline" size={18} color={Colors.primary} />
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={() => router.push('/orders/new')}>
            <Ionicons name="add" size={16} color={Colors.white} />
            <Text style={styles.addText}>새 발주</Text>
          </TouchableOpacity>
        </View>
      </View>

      {data.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconBg}>
            <Ionicons name="document-text-outline" size={28} color={Colors.gray400} />
          </View>
          <Text style={styles.emptyText}>발주 내역이 없어요</Text>
          <Text style={styles.emptySubtext}>
            새 발주를 등록하면{'\n'}재고가 자동으로 관리돼요
          </Text>
          <TouchableOpacity style={styles.emptyAction} onPress={() => router.push('/orders/new')}>
            <Text style={styles.emptyActionText}>발주 등록하기</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <OrderCard order={item} onDeliver={deliver} onDelete={remove} />
          )}
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: 16 }} color={Colors.primary} /> : null}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.black, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: Colors.gray400, marginTop: 2 },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.tinted,
    borderWidth: 1.5,
    borderColor: Colors.primary + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButtonDisabled: { opacity: 0.5 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  addText: { color: Colors.white, fontSize: 14, fontWeight: '700' },

  listContent: { padding: 16, gap: 10 },

  orderCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  orderCardLeft: { flex: 1 },
  supplierName: { fontSize: 16, fontWeight: '700', color: Colors.black, marginBottom: 3 },
  orderDate: { fontSize: 13, color: Colors.gray500 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '700' },

  orderCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalAmount: { fontSize: 17, fontWeight: '800', color: Colors.black, letterSpacing: -0.3 },
  itemCount: { fontSize: 12, color: Colors.gray400, marginTop: 2 },

  orderActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  deliverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  deliverButtonText: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
  },

  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIconBg: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  emptyText: { fontSize: 17, fontWeight: '700', color: Colors.gray700, marginBottom: 8 },
  emptySubtext: {
    fontSize: 14,
    color: Colors.gray400,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
  },
  emptyAction: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  emptyActionText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
