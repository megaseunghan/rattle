import { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
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

  return (
    <View style={styles.orderCard}>
      <View style={styles.orderCardHeader}>
        <View style={styles.orderCardLeft}>
          <Text style={styles.supplierName}>{order.supplier_name || '(거래처 미입력)'}</Text>
          <Text style={styles.orderDate}>{order.order_date}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[order.status] + '20' }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[order.status] }]}>
            {STATUS_LABELS[order.status]}
          </Text>
        </View>
      </View>

      <View style={styles.orderCardFooter}>
        <Text style={styles.totalAmount}>
          {order.total_amount.toLocaleString('ko-KR')}원 ({order.order_items.length}개 품목)
        </Text>
        <View style={styles.orderActions}>
          {order.status !== 'delivered' && (
            <TouchableOpacity style={styles.deliverButton} onPress={handleDeliver}>
              <Text style={styles.deliverButtonText}>입고</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>삭제</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function OrdersScreen() {
  const { data, loading, error, refetch, deliver, remove } = useOrders();
  useFocusEffect(useCallback(() => { refetch(); }, []));

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>발주</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => router.push('/orders/new')}>
          <Text style={styles.addText}>+ 새 발주</Text>
        </TouchableOpacity>
      </View>

      {data.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={48} color={Colors.gray300} style={styles.emptyIcon} />
          <Text style={styles.emptyText}>발주 내역이 없어요</Text>
          <Text style={styles.emptySubtext}>
            새 발주를 등록하면{'\n'}재고가 자동으로 관리돼요
          </Text>
          <TouchableOpacity style={styles.cameraButton} onPress={() => router.push('/orders/new')}>
            <Text style={styles.cameraText}>발주 등록하기</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <OrderCard order={item} onDeliver={deliver} onDelete={remove} />
          )}
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
    paddingVertical: 16,
  },
  title: { fontSize: 22, fontWeight: '800', color: Colors.black },
  addButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  listContent: { padding: 16, gap: 12 },
  orderCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderCardLeft: { flex: 1 },
  supplierName: { fontSize: 16, fontWeight: '700', color: Colors.black, marginBottom: 2 },
  orderDate: { fontSize: 13, color: Colors.gray500 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '700' },
  orderCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalAmount: { fontSize: 14, color: Colors.gray600, fontWeight: '600' },
  orderActions: { flexDirection: 'row', gap: 8 },
  deliverButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  deliverButtonText: { color: Colors.white, fontSize: 12, fontWeight: '700' },
  deleteButton: {
    backgroundColor: Colors.gray100,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  deleteButtonText: { color: Colors.gray600, fontSize: 12, fontWeight: '600' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyIcon: { marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '700', color: Colors.gray700, marginBottom: 8 },
  emptySubtext: {
    fontSize: 14,
    color: Colors.gray400,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  cameraButton: {
    backgroundColor: Colors.bg,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.pale,
  },
  cameraText: { fontSize: 15, fontWeight: '600', color: Colors.dark },
});
