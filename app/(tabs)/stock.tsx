import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { Ingredient } from '../../types';

function IngredientRow({
  item,
  onUpdateStock,
  onDelete,
}: {
  item: Ingredient;
  onUpdateStock: (id: string, stock: number) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [stockValue, setStockValue] = useState(String(item.current_stock));
  const isLowStock = item.current_stock <= item.min_stock;

  function handleStockSubmit() {
    const num = parseFloat(stockValue);
    if (!isNaN(num) && num >= 0) {
      onUpdateStock(item.id, num);
    }
    setEditing(false);
  }

  function handleDelete() {
    Alert.alert('식자재 삭제', `"${item.name}"을(를) 삭제하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => onDelete(item.id) },
    ]);
  }

  return (
    <View style={[styles.row, isLowStock && styles.rowLowStock]}>
      <View style={styles.rowLeft}>
        <View style={styles.rowNameRow}>
          <Text style={styles.rowName}>{item.name}</Text>
          {isLowStock && (
            <View style={styles.lowStockBadge}>
              <Text style={styles.lowStockText}>품절 임박</Text>
            </View>
          )}
        </View>
        <Text style={styles.rowCategory}>{item.category}</Text>
      </View>

      <View style={styles.rowRight}>
        {editing ? (
          <TextInput
            style={styles.stockInput}
            value={stockValue}
            onChangeText={setStockValue}
            keyboardType="numeric"
            onBlur={handleStockSubmit}
            onSubmitEditing={handleStockSubmit}
            autoFocus
          />
        ) : (
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={[styles.stockValue, isLowStock && styles.stockValueLow]}>
              {item.current_stock}{item.unit}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function StockScreen() {
  const { data, loading, error, refetch, update, remove } = useIngredients();

  async function handleUpdateStock(id: string, stock: number) {
    await update(id, { current_stock: stock });
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>재고</Text>
          {data.length > 0 && (
            <Text style={styles.subtitle}>{data.length}개 품목</Text>
          )}
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => router.push('/stock/new')}>
          <Text style={styles.addText}>+ 식자재</Text>
        </TouchableOpacity>
      </View>

      {data.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📊</Text>
          <Text style={styles.emptyText}>재고 데이터가 없어요</Text>
          <Text style={styles.emptySubtext}>
            발주를 등록하면 재고가 자동으로 관리돼요
          </Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <IngredientRow
              item={item}
              onUpdateStock={handleUpdateStock}
              onDelete={remove}
            />
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: { fontSize: 22, fontWeight: '800', color: Colors.black },
  subtitle: { fontSize: 14, color: Colors.gray500, marginTop: 2 },
  addButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  rowLowStock: {
    borderColor: Colors.warning + '60',
    backgroundColor: Colors.warning + '08',
  },
  rowLeft: { flex: 1 },
  rowNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  rowName: { fontSize: 15, fontWeight: '600', color: Colors.black },
  lowStockBadge: {
    backgroundColor: Colors.warning + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  lowStockText: { fontSize: 11, fontWeight: '700', color: Colors.warning },
  rowCategory: { fontSize: 12, color: Colors.gray400 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stockValue: { fontSize: 16, fontWeight: '700', color: Colors.black, minWidth: 60, textAlign: 'right' },
  stockValueLow: { color: Colors.warning },
  stockInput: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.black,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary,
    minWidth: 60,
    textAlign: 'right',
    paddingVertical: 2,
  },
  deleteBtn: { padding: 4 },
  deleteBtnText: { fontSize: 14, color: Colors.gray400 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '700', color: Colors.gray700, marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: Colors.gray400, textAlign: 'center' },
});
