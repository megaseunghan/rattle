import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/colors';
import { getPurchaseById, getPurchaseItems } from '../../lib/services/purchases';
import { Purchase, PurchaseItem } from '../../types';

export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [p, its] = await Promise.all([getPurchaseById(id), getPurchaseItems(id)]);
        setPurchase(p);
        setItems(its);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>매입 상세</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : purchase ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.summaryCard}>
            <Text style={styles.supplier}>{purchase.supplier || '거래처 미입력'}</Text>
            <View style={styles.pillRow}>
              <View style={styles.pill}><Text style={styles.pillText}>{purchase.category}</Text></View>
              <View style={styles.pill}><Text style={styles.pillText}>{purchase.type}</Text></View>
            </View>
            <Text style={styles.date}>{purchase.date}</Text>
            <Text style={styles.amount}>{purchase.amount.toLocaleString()}원</Text>
          </View>

          <Text style={styles.sectionLabel}>품목</Text>
          {items.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>금액만 입력된 매입이에요</Text>
            </View>
          ) : (
            <View style={styles.listCard}>
              {items.map((it, i) => (
                <View key={it.id} style={[styles.itemRow, i < items.length - 1 && styles.rowBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{it.name}</Text>
                    <Text style={styles.itemSub}>
                      {it.quantity}{it.unit} × {it.unit_price.toLocaleString()}원
                      {it.ingredient_id ? '  · 재고 반영' : ''}
                    </Text>
                  </View>
                  <Text style={styles.itemSubtotal}>{it.subtotal.toLocaleString()}원</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.black },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 14, color: Colors.gray500 },
  scroll: { padding: 16, gap: 14 },

  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: Colors.gray100,
    padding: 20,
    gap: 6,
  },
  supplier: { fontSize: 18, fontWeight: '700', color: Colors.black },
  pillRow: { flexDirection: 'row', gap: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: Colors.gray100 },
  pillText: { fontSize: 11, color: Colors.gray500 },
  date: { fontSize: 13, color: Colors.gray400, marginTop: 2 },
  amount: { fontSize: 26, fontWeight: '800', color: Colors.black, marginTop: 4 },

  sectionLabel: { fontSize: 11, fontWeight: '500', color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5 },
  listCard: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.gray100 },
  emptyCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: Colors.gray100,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: { fontSize: 14, color: Colors.gray400 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 10 },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  itemName: { fontSize: 14, fontWeight: '500', color: Colors.black },
  itemSub: { fontSize: 12, color: Colors.gray400, marginTop: 2 },
  itemSubtotal: { fontSize: 14, fontWeight: '600', color: Colors.black },
});
