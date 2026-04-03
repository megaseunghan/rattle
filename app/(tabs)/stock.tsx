import { useState, useCallback, useEffect } from 'react';
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
  Modal,
  ActivityIndicator,
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
import { useCategories } from '../../lib/hooks/useCategories';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { Ingredient } from '../../types';

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
  const { categories, refetch: refetchCategories, add: addCategory, rename: renameCategory, remove: removeCategory, countByCategory } = useCategories();

  const [csvUploading, setCsvUploading] = useState(false);
  const [viewMode, setViewMode] = useState<'category' | 'supplier'>('category');
  const [activeCategory, setActiveCategory] = useState('전체');
  const [activeSupplier, setActiveSupplier] = useState('전체');

  // Modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [catOpLoading, setCatOpLoading] = useState(false);

  useFocusEffect(useCallback(() => { refetch(); }, []));

  // activeCategory가 더 이상 유효하지 않으면 '전체'로 리셋
  useEffect(() => {
    if (activeCategory !== '전체' && categories.length > 0 && !categories.includes(activeCategory)) {
      setActiveCategory('전체');
    }
  }, [categories]);

  const suppliers = ['전체', ...Array.from(new Set(
    data.filter(i => i.supplier_name).map(i => i.supplier_name as string)
  )).sort()];

  const filtered = data
    .filter(item => viewMode === 'supplier'
      ? (activeSupplier === '전체' || item.supplier_name === activeSupplier)
      : (activeCategory === '전체' || item.category === activeCategory)
    )
    .sort((a, b) => {
      const aLow = a.current_stock <= a.min_stock ? 0 : 1;
      const bLow = b.current_stock <= b.min_stock ? 0 : 1;
      return aLow - bLow || a.name.localeCompare(b.name);
    });

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
      errors.length > 0 ? `건너뜀: ${errors.length}개` : null,
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

  async function handleAddCategory() {
    const name = newCatName.trim();
    if (!name) return;
    if (categories.includes(name)) {
      Alert.alert('오류', '이미 존재하는 카테고리입니다.');
      return;
    }
    setCatOpLoading(true);
    try {
      await addCategory(name);
      setNewCatName('');
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setCatOpLoading(false);
    }
  }

  async function handleRenameCategory() {
    const newName = editingCatName.trim();
    if (!newName || !editingCat) return;
    if (newName === editingCat) { setEditingCat(null); return; }
    if (categories.includes(newName)) {
      Alert.alert('오류', '이미 존재하는 카테고리입니다.');
      return;
    }
    setCatOpLoading(true);
    try {
      await renameCategory(editingCat, newName);
      setEditingCat(null);
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setCatOpLoading(false);
    }
  }

  async function handleDeleteCategory(name: string) {
    const count = await countByCategory(name);
    const message = count > 0
      ? `"${name}" 카테고리를 삭제하면 해당 식자재 ${count}개가 '기타'로 이동됩니다.`
      : `"${name}" 카테고리를 삭제하시겠습니까?`;

    Alert.alert('카테고리 삭제', message, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          setCatOpLoading(true);
          try {
            await removeCategory(name);
          } catch (e: any) {
            Alert.alert('오류', e.message);
          } finally {
            setCatOpLoading(false);
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

      {/* 보기 모드 토글 */}
      <View style={styles.viewToggleRow}>
        <TouchableOpacity
          style={[styles.viewToggleBtn, viewMode === 'category' && styles.viewToggleBtnActive]}
          onPress={() => setViewMode('category')}
        >
          <Text style={[styles.viewToggleText, viewMode === 'category' && styles.viewToggleTextActive]}>
            카테고리별
          </Text>
        </TouchableOpacity>
        {suppliers.length > 1 && (
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === 'supplier' && styles.viewToggleBtnActive]}
            onPress={() => setViewMode('supplier')}
          >
            <Text style={[styles.viewToggleText, viewMode === 'supplier' && styles.viewToggleTextActive]}>
              거래처별
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 카테고리 탭 */}
      {viewMode === 'category' && (
        <View style={styles.tabRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabBar}
            style={styles.tabScroll}
          >
            {['전체', ...categories].map(tab => {
              const count = tab === '전체'
                ? data.length
                : data.filter(i => i.category === tab).length;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tab, activeCategory === tab && styles.tabActive]}
                  onPress={() => setActiveCategory(tab)}
                >
                  <Text style={[styles.tabText, activeCategory === tab && styles.tabTextActive]}>
                    {tab}{count > 0 ? ` ${count}` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity
            style={styles.editCatBtn}
            onPress={() => setShowCategoryModal(true)}
          >
            <Text style={styles.editCatText}>편집</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 거래처 탭 */}
      {viewMode === 'supplier' && (
        <View style={styles.tabRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabBar}
            style={styles.tabScroll}
          >
            {suppliers.map(s => {
              const count = s === '전체' ? data.length : data.filter(i => i.supplier_name === s).length;
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.tab, activeSupplier === s && styles.tabActive]}
                  onPress={() => setActiveSupplier(s)}
                >
                  <Text style={[styles.tabText, activeSupplier === s && styles.tabTextActive]}>
                    {s}{count > 0 ? ` ${count}` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
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
          <Text style={styles.emptyText}>
            {viewMode === 'category' ? activeCategory : activeSupplier} 품목이 없어요
          </Text>
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

      {/* 카테고리 편집 모달 */}
      <Modal visible={showCategoryModal} animationType="slide" transparent>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCategoryModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>카테고리 편집</Text>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                <Text style={styles.modalClose}>닫기</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {categories.map(cat => (
                <View key={cat} style={styles.catRow}>
                  {editingCat === cat ? (
                    <TextInput
                      style={styles.catEditInput}
                      value={editingCatName}
                      onChangeText={setEditingCatName}
                      autoFocus
                      onSubmitEditing={handleRenameCategory}
                    />
                  ) : (
                    <Text style={styles.catName}>{cat}</Text>
                  )}

                  <View style={styles.catActions}>
                    {editingCat === cat ? (
                      <TouchableOpacity
                        style={styles.catConfirmBtn}
                        onPress={handleRenameCategory}
                        disabled={catOpLoading}
                      >
                        <Text style={styles.catConfirmText}>확인</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.catActionBtn}
                        onPress={() => { setEditingCat(cat); setEditingCatName(cat); }}
                      >
                        <Ionicons name="pencil-outline" size={16} color={Colors.gray500} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.catActionBtn}
                      onPress={() => handleDeleteCategory(cat)}
                      disabled={catOpLoading}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              <View style={styles.addCatRow}>
                <TextInput
                  style={styles.addCatInput}
                  value={newCatName}
                  onChangeText={setNewCatName}
                  placeholder="새 카테고리 이름"
                  placeholderTextColor={Colors.gray400}
                  onSubmitEditing={handleAddCategory}
                />
                <TouchableOpacity
                  style={[styles.addCatBtn, !newCatName.trim() && styles.addCatBtnDisabled]}
                  onPress={handleAddCategory}
                  disabled={!newCatName.trim() || catOpLoading}
                >
                  {catOpLoading
                    ? <ActivityIndicator size="small" color={Colors.white} />
                    : <Text style={styles.addCatBtnText}>추가</Text>
                  }
                </TouchableOpacity>
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  tabScroll: { flex: 1 },
  tabBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 6,
    flexDirection: 'row',
  },
  editCatBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    marginRight: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  editCatText: { fontSize: 12, fontWeight: '600', color: Colors.gray500 },
  viewToggleRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 6,
  },
  viewToggleBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  viewToggleBtnActive: {
    backgroundColor: Colors.dark,
    borderColor: Colors.dark,
  },
  viewToggleText: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  viewToggleTextActive: { color: Colors.white },
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
  // Category modal
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.black },
  modalClose: { fontSize: 15, color: Colors.primary, fontWeight: '600' },
  modalScroll: { paddingHorizontal: 20 },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  catName: { flex: 1, fontSize: 15, color: Colors.black, fontWeight: '500' },
  catEditInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.black,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary,
    paddingVertical: 2,
    marginRight: 8,
  },
  catActions: { flexDirection: 'row', gap: 4 },
  catActionBtn: { padding: 8 },
  catConfirmBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    marginRight: 4,
  },
  catConfirmText: { fontSize: 13, color: Colors.white, fontWeight: '600' },
  addCatRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 16,
    paddingBottom: 32,
  },
  addCatInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.black,
    backgroundColor: Colors.gray50,
  },
  addCatBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: 'center',
  },
  addCatBtnDisabled: { opacity: 0.4 },
  addCatBtnText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
});
