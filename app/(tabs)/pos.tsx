import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useTossSync } from '../../lib/hooks/useTossSync';
import { TossOrder } from '../../types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function today() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function weekAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export default function PosScreen() {
  const { loading, error, lastSyncAt, todaySales, todayOrderCount, syncOrders, loadTodaySales } = useTossSync();
  const [orders, setOrders] = useState<TossOrder[]>([]);
  const [synced, setSynced] = useState(false);

  useFocusEffect(useCallback(() => {
    loadTodaySales();
  }, []));

  async function handleSync() {
    try {
      const result = await syncOrders(weekAgo(), today());
      setOrders(result);
      setSynced(true);
      await loadTodaySales();
    } catch (e: any) {
      Alert.alert('동기화 실패', e.message);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Toss Place POS</Text>
        {lastSyncAt && (
          <Text style={styles.lastSync}>
            최근 동기화: {new Date(lastSyncAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 오늘 매출 요약 */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Ionicons name="cash-outline" size={22} color={Colors.primary} style={styles.summaryIcon} />
            <Text style={styles.summaryValue}>{todaySales.toLocaleString('ko-KR')}원</Text>
            <Text style={styles.summaryLabel}>오늘 매출</Text>
          </View>
          <View style={styles.summaryCard}>
            <Ionicons name="receipt-outline" size={22} color={Colors.primary} style={styles.summaryIcon} />
            <Text style={styles.summaryValue}>{todayOrderCount}건</Text>
            <Text style={styles.summaryLabel}>오늘 주문</Text>
          </View>
        </View>

        {/* 동기화 버튼 */}
        <TouchableOpacity
          style={[styles.syncBtn, loading && styles.syncBtnDisabled]}
          onPress={handleSync}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <>
              <Ionicons name="sync-outline" size={18} color={Colors.white} />
              <Text style={styles.syncBtnText}>최근 7일 주문 동기화</Text>
            </>
          )}
        </TouchableOpacity>

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* 동기화된 주문 목록 */}
        {synced && (
          <>
            <Text style={styles.sectionTitle}>
              동기화된 주문 ({orders.length}건)
            </Text>
            {orders.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>해당 기간에 주문이 없습니다.</Text>
              </View>
            ) : (
              orders.map(order => (
                <View key={order.orderId} style={styles.orderCard}>
                  <View style={styles.orderTop}>
                    <Text style={styles.orderDate}>{formatDate(order.orderAt)}</Text>
                    <View style={[
                      styles.statusBadge,
                      order.status === 'COMPLETED' ? styles.statusCompleted
                        : order.status === 'CANCELLED' ? styles.statusCancelled
                        : styles.statusRefunded,
                    ]}>
                      <Text style={[
                        styles.statusText,
                        order.status === 'COMPLETED' ? styles.statusTextCompleted
                          : styles.statusTextCancelled,
                      ]}>
                        {order.status === 'COMPLETED' ? '완료' : order.status === 'CANCELLED' ? '취소' : '환불'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.orderBottom}>
                    <Text style={styles.orderItems}>
                      {order.items.slice(0, 2).map(i => i.itemName).join(', ')}
                      {order.items.length > 2 ? ` 외 ${order.items.length - 2}건` : ''}
                    </Text>
                    <Text style={styles.orderAmount}>{order.totalAmount.toLocaleString('ko-KR')}원</Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  title: { fontSize: 20, fontWeight: '800', color: Colors.black },
  lastSync: { fontSize: 12, color: Colors.gray400, marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 40 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  summaryCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 14,
    padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.gray100,
  },
  summaryIcon: { marginBottom: 6 },
  summaryValue: { fontSize: 18, fontWeight: '800', color: Colors.black, marginBottom: 2 },
  summaryLabel: { fontSize: 12, color: Colors.gray500 },
  syncBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 14, marginBottom: 16,
  },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.danger + '15', borderRadius: 10,
    padding: 12, marginBottom: 16,
  },
  errorText: { fontSize: 13, color: Colors.danger, flex: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.black, marginBottom: 12 },
  emptyBox: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 24,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.gray100,
  },
  emptyText: { fontSize: 14, color: Colors.gray400 },
  orderCard: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.gray100, marginBottom: 10,
  },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderDate: { fontSize: 13, color: Colors.gray500 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusCompleted: { backgroundColor: Colors.success + '15' },
  statusCancelled: { backgroundColor: Colors.danger + '15' },
  statusRefunded: { backgroundColor: Colors.warning + '15' },
  statusText: { fontSize: 11, fontWeight: '700' },
  statusTextCompleted: { color: Colors.success },
  statusTextCancelled: { color: Colors.danger },
  orderBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderItems: { fontSize: 14, color: Colors.black, flex: 1, marginRight: 8 },
  orderAmount: { fontSize: 15, fontWeight: '700', color: Colors.primary },
});
