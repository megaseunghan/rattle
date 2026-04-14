import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { getOrderById, deleteOrder, OrderWithItems } from '../../lib/services/orders';
import { useAuth } from '../../lib/contexts/AuthContext';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { ErrorMessage } from '../../lib/components/ErrorMessage';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentRole } = useAuth();
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadOrder();
  }, [id]);

  async function loadOrder() {
    try {
      setLoading(true);
      const data = await getOrderById(id);
      setOrder(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    Alert.alert('발주 삭제', '이 발주 내역을 삭제하시겠습니까? 관련 재고 데이터에는 영향을 주지 않습니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            setSaving(true);
            await deleteOrder(id);
            router.back();
          } catch (e: any) {
            Alert.alert('삭제 실패', e.message);
          } finally {
            setSaving(false);
          }
        }
      }
    ]);
  }

  if (loading) return <LoadingSpinner />;
  if (error || !order) return <ErrorMessage message={error || '발주를 찾을 수 없습니다.'} onRetry={loadOrder} />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>발주 상세</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <View style={styles.section}>
            <Text style={styles.label}>거래처</Text>
            <Text style={styles.value}>{order.supplier_name}</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>발주 일자</Text>
            <Text style={styles.value}>{new Date(order.order_date).toLocaleDateString('ko-KR')}</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>상태</Text>
            <View style={[styles.statusBadge, order.status === 'delivered' ? styles.statusDelivered : styles.statusPending]}>
              <Text style={[styles.statusText, order.status === 'delivered' ? styles.statusTextDelivered : styles.statusTextPending]}>
                {order.status === 'delivered' ? '입고완료' : order.status === 'confirmed' ? '확정' : '대기'}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>품목 목록</Text>
        {order.order_items?.map((item, idx) => (
          <View key={idx} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemName}>{item.ingredient?.name || '알 수 없는 품목'}</Text>
              <Text style={styles.itemCategory}>{item.ingredient?.category}</Text>
            </View>
            <View style={styles.itemDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>수량</Text>
                <Text style={styles.detailValue}>{item.quantity} {item.unit}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>단가</Text>
                <Text style={styles.detailValue}>{item.unit_price.toLocaleString()}원</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>소계</Text>
                <Text style={styles.subtotal}>{(item.quantity * item.unit_price).toLocaleString()}원</Text>
              </View>
            </View>
          </View>
        ))}

        <View style={styles.totalSection}>
          <Text style={styles.totalLabel}>총 합계</Text>
          <Text style={styles.totalValue}>{order.total_amount.toLocaleString()}원</Text>
        </View>

        {currentRole === 'admin' && (
          <View style={styles.deleteContainer}>
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color={Colors.danger} /> : <Text style={styles.deleteBtnText}>발주 내역 삭제</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.black },
  scroll: { padding: 20, paddingBottom: 48 },
  card: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: Colors.gray100, marginBottom: 20,
  },
  section: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  label: { fontSize: 14, color: Colors.gray500 },
  value: { fontSize: 15, fontWeight: '600', color: Colors.black },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusPending: { backgroundColor: Colors.warning + '15' },
  statusDelivered: { backgroundColor: Colors.success + '15' },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusTextPending: { color: Colors.warning },
  statusTextDelivered: { color: Colors.success },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.black, marginBottom: 12 },
  itemCard: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: Colors.gray100, marginBottom: 12,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  itemName: { fontSize: 15, fontWeight: '700', color: Colors.black },
  itemCategory: { fontSize: 12, color: Colors.gray400 },
  itemDetails: { gap: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel: { fontSize: 13, color: Colors.gray500 },
  detailValue: { fontSize: 13, color: Colors.black },
  subtotal: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  totalSection: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 8, paddingHorizontal: 4,
  },
  totalLabel: { fontSize: 16, fontWeight: '700', color: Colors.black },
  totalValue: { fontSize: 20, fontWeight: '800', color: Colors.primary },
  deleteContainer: { marginTop: 40, alignItems: 'center' },
  deleteBtn: {
    paddingVertical: 12, paddingHorizontal: 40, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.danger,
  },
  deleteBtnText: { color: Colors.danger, fontSize: 15, fontWeight: '600' },
});
