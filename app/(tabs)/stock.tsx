import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
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
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import Papa from 'papaparse';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { Ingredient } from '../../types';

const VALID_CATEGORIES = ['주류', '식자재', '비품소모품'];

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
  const { store } = useAuth();
  const { data, loading, error, refetch, update, remove, bulkCreate } = useIngredients();
  const [csvUploading, setCsvUploading] = useState(false);

  useFocusEffect(useCallback(() => { refetch(); }, []));

  async function handleUpdateStock(id: string, stock: number) {
    await update(id, { current_stock: stock });
  }

  async function handleCsvUpload() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain'],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;

    const uri = result.assets[0].uri;
    let text: string;
    try {
      const response = await fetch(uri);
      text = await response.text();
    } catch {
      Alert.alert('오류', '파일을 읽을 수 없어요.');
      return;
    }

    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });

    const valid: Omit<Ingredient, 'id' | 'updated_at' | 'created_at'>[] = [];
    const errors: string[] = [];

    parsed.data.forEach((row, i) => {
      const name = row.name?.trim();
      const unit = row.unit?.trim();
      const category = row.category?.trim();

      if (!name || !unit) {
        errors.push(`${i + 2}행: name, unit 필수`);
        return;
      }
      if (category && !VALID_CATEGORIES.includes(category)) {
        errors.push(`${i + 2}행: category는 주류/식자재/비품소모품 중 하나여야 해요`);
        return;
      }

      valid.push({
        store_id: store!.id,
        name,
        category: category || '기타',
        unit,
        current_stock: parseFloat(row.current_stock) || 0,
        min_stock: parseFloat(row.min_stock) || 0,
        last_price: parseFloat(row.last_price) || 0,
      });
    });

    if (valid.length === 0) {
      Alert.alert('유효한 데이터 없음', errors.join('\n') || 'CSV 형식을 확인해주세요.');
      return;
    }

    const summary = [
      `총 ${valid.length}개 항목을 등록합니다.`,
      ...VALID_CATEGORIES.map(c => {
        const count = valid.filter(v => v.category === c).length;
        return count > 0 ? `${c}: ${count}개` : null;
      }).filter(Boolean),
      errors.length > 0 ? `\n건너뜀: ${errors.length}개` : null,
    ].filter(Boolean).join('\n');

    Alert.alert('CSV 업로드 확인', summary, [
      { text: '취소', style: 'cancel' },
      {
        text: '등록',
        onPress: async () => {
          setCsvUploading(true);
          try {
            const count = await bulkCreate(valid);
            Alert.alert('완료', `${count}개 항목이 등록되었어요.`);
          } catch (e: any) {
            Alert.alert('오류', e.message);
          } finally {
            setCsvUploading(false);
          }
        },
      },
    ]);
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
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.csvButton}
            onPress={handleCsvUpload}
            disabled={csvUploading}
          >
            <Ionicons name="cloud-upload-outline" size={16} color={Colors.primary} />
            <Text style={styles.csvText}>CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={() => router.push('/stock/new')}>
            <Text style={styles.addText}>+ 식자재</Text>
          </TouchableOpacity>
        </View>
      </View>

      {data.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="bar-chart-outline" size={48} color={Colors.gray300} style={styles.emptyIcon} />
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
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  csvButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  csvText: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
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
  emptyIcon: { marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '700', color: Colors.gray700, marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: Colors.gray400, textAlign: 'center' },
});
