import { useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { usePosAnalytics } from '../../lib/hooks/usePosAnalytics';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { DailyItem } from '../../types';

function ItemRow({ item }: { item: DailyItem }) {
  return (
    <View style={styles.itemRow}>
      <View style={styles.itemLeft}>
        <Text style={styles.itemName}>{item.itemName}</Text>
        {item.categoryName ? (
          <Text style={styles.itemCategory}>{item.categoryName}</Text>
        ) : null}
      </View>
      <View style={styles.itemRight}>
        <Text style={styles.itemQty}>{item.quantity}개</Text>
        <Text style={styles.itemAmount}>{item.totalAmount.toLocaleString('ko-KR')}원</Text>
      </View>
    </View>
  );
}

export default function PosDateScreen() {
  const { date, from: encodedFrom, to: encodedTo } = useLocalSearchParams<{ date: string; from: string; to: string }>();
  const from = decodeURIComponent(encodedFrom ?? '');
  const to = decodeURIComponent(encodedTo ?? '');

  const {
    items, allItems, categories, activeCategory, setActiveCategory,
    loadingItems, error, fetchItems,
  } = usePosAnalytics();

  useFocusEffect(useCallback(() => {
    if (from && to) fetchItems(from, to);
  }, [from, to, fetchItems]));

  const totalAmount = allItems.reduce((sum, i) => sum + i.totalAmount, 0);
  const totalQty = allItems.reduce((sum, i) => sum + i.quantity, 0);

  if (error) return <ErrorMessage message={error} onRetry={() => fetchItems(from, to)} />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerDate}>{date}</Text>
          <Text style={styles.headerSub}>{totalQty}개 · {totalAmount.toLocaleString('ko-KR')}원</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* 카테고리 필터 */}
      {categories.length > 1 && (
        <View style={styles.filterBar}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={categories}
            keyExtractor={c => c}
            contentContainerStyle={styles.filterContent}
            renderItem={({ item: cat }) => (
              <TouchableOpacity
                style={[styles.filterChip, activeCategory === cat && styles.filterChipActive]}
                onPress={() => setActiveCategory(cat)}
              >
                <Text style={[styles.filterChipText, activeCategory === cat && styles.filterChipTextActive]}>
                  {cat || '미분류'}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {loadingItems
        ? <ActivityIndicator size="large" color={Colors.primary} style={{ flex: 1 }} />
        : (
          <FlatList
            data={items}
            keyExtractor={i => i.itemId || i.itemName}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <ItemRow item={item} />}
            ListEmptyComponent={
              <Text style={styles.emptyText}>해당 카테고리의 판매 내역이 없습니다.</Text>
            }
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )
      }
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  headerDate: { fontSize: 16, fontWeight: '800', color: Colors.black },
  headerSub: { fontSize: 12, color: Colors.gray500, marginTop: 2 },
  filterBar: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  filterContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.gray200, backgroundColor: Colors.white,
  },
  filterChipActive: { backgroundColor: Colors.dark, borderColor: Colors.dark },
  filterChipText: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  filterChipTextActive: { color: Colors.white },
  list: { paddingHorizontal: 16, paddingVertical: 12 },
  itemRow: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  itemLeft: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '600', color: Colors.black },
  itemCategory: { fontSize: 12, color: Colors.gray400, marginTop: 2 },
  itemRight: { alignItems: 'flex-end', gap: 2 },
  itemQty: { fontSize: 13, color: Colors.gray500 },
  itemAmount: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  separator: { height: 8 },
  emptyText: { textAlign: 'center', color: Colors.gray400, paddingVertical: 40 },
});
