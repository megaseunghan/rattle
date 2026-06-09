import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { OrderWithItems } from '../services/orders';
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

/**
 * 발주 카드 — 상태 표시 + 입고 처리(가격변동 감지·재고 자동 반영) + 삭제.
 * 발주 단독 화면과 재고 허브(발주 세그먼트)에서 공용으로 사용.
 */
export function OrderCard({
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

const styles = StyleSheet.create({
  orderCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    marginBottom: 10,
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
});
