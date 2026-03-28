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
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import Papa from 'papaparse';
import { Colors } from '../../constants/colors';
import { formatStock } from '../../lib/utils/unit';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { Ingredient } from '../../types';

const VALID_CATEGORIES = ['주류', '식자재', '비품소모품'];
const FILTER_TABS = ['전체', '식자재', '주류', '비품소모품'] as const;
type FilterTab = typeof FILTER_TABS[number];

function IngredientRow({
  item,
  onUpdateStock,
  onDelete,
  onEdit,
}: {
  item: Ingredient;
  onUpdateStock: (id: string, stock: number) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
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
    <TouchableOpacity
      style={[styles.row, isLowStock && styles.rowLowStock]}
      onPress={() => onEdit(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.rowLeft}>
        <View style={styles.rowNameRow}>
          <Text style={styles.rowName}>{item.name}</Text>
          {isLowStock && (
            <View style={styles.lowStockBadge}>
              <Text style={styles.lowStockText}>품절 임박</Text>
            </View>
          )}
        </View>
        <Text style={styles.rowCategory}>
          {item.category}{item.min_stock > 0 ? ` · 최소 ${item.min_stock}${item.unit}` : ''}{item.supplier_name ? ` · ${item.supplier_name}` : ''}
        </Text>
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
              {formatStock(item.current_stock, item)}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export default function StockScreen() {
  const { store } = useAuth();
  const { data, loading, error, refetch, update, remove, bulkCreate } = useIngredients();
  const [csvUploading, setCsvUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('전체');
  const [activeSupplier, setActiveSupplier] = useState('전체');

  useFocusEffect(useCallback(() => { refetch(); }, []));

  const suppliers = ['전체', ...Array.from(new Set(
    data.filter(i => i.supplier_name).map(i => i.supplier_name as string)
  )).sort()];

  const filtered = data
    .filter(item => activeTab === '전체' || item.category === activeTab)
    .filter(item => activeSupplier === '전체' || item.supplier_name === activeSupplier)
    .sort((a, b) => {
      const aLow = a.current_stock <= a.min_stock ? 0 : 1;
      const bLow = b.current_stock <= b.min_stock ? 0 : 1;
      return aLow - bLow || a.name.localeCompare(b.name);
    });

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
        container_unit: null,
        container_size: null,
        supplier_name: null,
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

      {/* 카테고리 필터 탭 */}
      <View style={styles.tabBar}>
        {FILTER_TABS.map(tab => {
          const count = tab === '전체'
            ? data.length
            : data.filter(i => i.category === tab).length;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab}{count > 0 ? ` ${count}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 거래처 필터 (거래처가 1개 이상일 때만 표시) */}
      {suppliers.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.supplierBar}
        >
          {suppliers.map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.supplierChip, activeSupplier === s && styles.supplierChipActive]}
              onPress={() => setActiveSupplier(s)}
            >
              <Text style={[styles.supplierChipText, activeSupplier === s && styles.supplierChipTextActive]}>
                {s}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {data.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="bar-chart-outline" size={48} color={Colors.gray300} style={styles.emptyIcon} />
          <Text style={styles.emptyText}>재고 데이터가 없어요</Text>
          <Text style={styles.emptySubtext}>
            발주를 등록하면 재고가 자동으로 관리돼요
          </Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{activeTab} 품목이 없어요</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <IngredientRow
              item={item}
              onUpdateStock={(id, stock) => update(id, { current_stock: stock })}
              onDelete={remove}
              onEdit={(id) => router.push(`/stock/${id}`)}
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
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 6,
  },
  supplierBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 6,
    flexDirection: 'row',
  },
  supplierChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  supplierChipActive: {
    backgroundColor: Colors.dark,
    borderColor: Colors.dark,
  },
  supplierChipText: { fontSize: 12, fontWeight: '600', color: Colors.gray500 },
  supplierChipTextActive: { color: Colors.white },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  tabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  tabTextActive: { color: Colors.white },
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
