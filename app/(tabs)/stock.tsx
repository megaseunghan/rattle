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
import { BulkCategoryModal } from '../../lib/components/BulkCategoryModal';
import { getIngredientsByCategory } from '../../lib/services/ingredients';
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
              <Ionicons name="alert-circle" size={10} color={Colors.warning} />
              <Text style={styles.lowStockText}>품절 임박</Text>
            </View>
          )}
        </View>
        <Text style={styles.rowCategory}>
          {item.category}
          {item.min_stock > 0 ? ` · 최소 ${item.min_stock}${item.unit}` : ''}
          {item.supplier_name ? ` · ${item.supplier_name}` : ''}
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
          <Ionicons name="trash-outline" size={15} color={Colors.gray300} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export default function StockScreen() {
  const { store } = useAuth();
  const { data, loading, loadingMore, hasMore, loadMore, error, refetch, update, remove, bulkCreate, bulkUpdateCategory } = useIngredients();
  const { categories, add: addCategory, rename: renameCategory, remove: removeCategory, countByCategory } = useCategories();

  const [csvUploading, setCsvUploading] = useState(false);
  const [showBulkCat, setShowBulkCat] = useState(false);
  const [bulkCatItems, setBulkCatItems] = useState<{ id: string; name: string }[]>([]);
  const [loadingBulkCat, setLoadingBulkCat] = useState(false);
  const [viewMode, setViewMode] = useState<'category' | 'supplier'>('category');
  const [activeCategory, setActiveCategory] = useState('전체');
  const [activeSupplier, setActiveSupplier] = useState('전체');

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [catOpLoading, setCatOpLoading] = useState(false);

  useFocusEffect(useCallback(() => { refetch(); }, []));

  const unclassifiedCount = data.filter(i => i.category === '기타').length;

  async function handleOpenBulkCat() {
    if (!store) return;
    setLoadingBulkCat(true);
    try {
      const items = await getIngredientsByCategory(store.id, '기타');
      setBulkCatItems(items);
      setShowBulkCat(true);
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setLoadingBulkCat(false);
    }
  }

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

  const lowStockCount = data.filter(i => i.current_stock <= i.min_stock).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>재고</Text>
          {data.length > 0 && (
            <Text style={styles.subtitle}>
              {data.length}개 품목
              {lowStockCount > 0 && (
                <Text style={styles.subtitleWarn}> · 품절 임박 {lowStockCount}개</Text>
              )}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.csvButton}
          onPress={handleCsvUpload}
          disabled={csvUploading}
        >
          {csvUploading
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <>
                <Ionicons name="cloud-upload-outline" size={15} color={Colors.primary} />
                <Text style={styles.csvText}>CSV</Text>
              </>
          }
        </TouchableOpacity>
      </View>

      {/* 보기 모드 토글 */}
      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[styles.segmentBtn, viewMode === 'category' && styles.segmentBtnActive]}
          onPress={() => setViewMode('category')}
        >
          <Text style={[styles.segmentText, viewMode === 'category' && styles.segmentTextActive]}>
            카테고리별
          </Text>
        </TouchableOpacity>
        {suppliers.length > 1 && (
          <TouchableOpacity
            style={[styles.segmentBtn, viewMode === 'supplier' && styles.segmentBtnActive]}
            onPress={() => setViewMode('supplier')}
          >
            <Text style={[styles.segmentText, viewMode === 'supplier' && styles.segmentTextActive]}>
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
                    {tab}
                    {count > 0 ? <Text style={styles.tabCount}> {count}</Text> : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity
            style={styles.editCatBtn}
            onPress={() => setShowCategoryModal(true)}
          >
            <Ionicons name="settings-outline" size={15} color={Colors.gray500} />
          </TouchableOpacity>
        </View>
      )}

      {/* 거래처 탭 */}
      {viewMode === 'supplier' && (
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
                  {s}
                  {count > 0 ? <Text style={styles.tabCount}> {count}</Text> : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {unclassifiedCount > 0 && (
        <TouchableOpacity
          style={styles.unclassifiedBanner}
          onPress={handleOpenBulkCat}
          disabled={loadingBulkCat}
          activeOpacity={0.75}
        >
          <View style={styles.unclassifiedLeft}>
            <Ionicons name="folder-open-outline" size={15} color={Colors.warning} />
            <Text style={styles.unclassifiedText}>기타(미분류) {unclassifiedCount}개</Text>
          </View>
          {loadingBulkCat
            ? <ActivityIndicator size="small" color={Colors.warning} />
            : <Text style={styles.unclassifiedAction}>카테고리 지정 →</Text>
          }
        </TouchableOpacity>
      )}

      <BulkCategoryModal
        visible={showBulkCat}
        items={bulkCatItems}
        categories={categories}
        onConfirm={async (ids, category) => {
          await bulkUpdateCategory(ids, category);
          setShowBulkCat(false);
        }}
        onClose={() => setShowBulkCat(false)}
      />

      {data.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconBg}>
            <Ionicons name="bar-chart-outline" size={28} color={Colors.gray400} />
          </View>
          <Text style={styles.emptyText}>재고 데이터가 없어요</Text>
          <Text style={styles.emptySubtext}>발주를 등록하면 재고가 자동으로 관리돼요</Text>
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
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <IngredientRow
              item={item}
              onUpdateStock={(id, stock) => update(id, { current_stock: stock })}
              onDelete={remove}
              onEdit={(id) => router.push(`/stock/${id}`)}
            />
          )}
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: 16 }} color={Colors.primary} /> : null}
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
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>카테고리 편집</Text>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={Colors.gray500} />
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
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.black, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: Colors.gray400, marginTop: 2 },
  subtitleWarn: { color: Colors.warning, fontWeight: '600' },
  csvButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.primary + '60',
    backgroundColor: Colors.tinted,
  },
  csvText: { color: Colors.primary, fontSize: 13, fontWeight: '700' },

  // 세그먼트 컨트롤
  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.gray100,
    borderRadius: 12,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
  },
  segmentBtnActive: {
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentText: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  segmentTextActive: { color: Colors.black, fontWeight: '700' },

  // 탭 바
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    marginBottom: 4,
  },
  tabScroll: { flex: 1 },
  tabBar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 6,
    flexDirection: 'row',
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  tabTextActive: { color: Colors.white },
  tabCount: { fontWeight: '500', opacity: 0.8 },
  editCatBtn: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    marginRight: 4,
    borderRadius: 10,
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },

  // 리스트 행
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  rowLowStock: {
    borderLeftColor: Colors.warning,
    backgroundColor: Colors.warning + '06',
  },
  rowLeft: { flex: 1 },
  rowNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  rowName: { fontSize: 15, fontWeight: '600', color: Colors.black },
  lowStockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.warning + '20',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  lowStockText: { fontSize: 11, fontWeight: '700', color: Colors.warning },
  rowCategory: { fontSize: 12, color: Colors.gray400 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stockValue: { fontSize: 16, fontWeight: '700', color: Colors.black, minWidth: 60, textAlign: 'right' },
  stockValueLow: { color: Colors.warning },
  stockInput: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.black,
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
    minWidth: 60,
    textAlign: 'right',
    paddingVertical: 2,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // 빈 상태
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyIconBg: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  emptyText: { fontSize: 17, fontWeight: '700', color: Colors.gray700, marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: Colors.gray400, textAlign: 'center' },

  // 카테고리 모달
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    paddingTop: 8,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray200,
    alignSelf: 'center',
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.black },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
    paddingVertical: 2,
    marginRight: 8,
  },
  catActions: { flexDirection: 'row', gap: 4 },
  catActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.gray50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  catConfirmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    marginRight: 4,
  },
  catConfirmText: { fontSize: 13, color: Colors.white, fontWeight: '700' },
  addCatRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 16,
    paddingBottom: 40,
  },
  addCatInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.gray200,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: Colors.black,
    backgroundColor: Colors.gray50,
  },
  addCatBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    justifyContent: 'center',
  },
  addCatBtnDisabled: { opacity: 0.4 },
  addCatBtnText: { color: Colors.white, fontSize: 14, fontWeight: '700' },

  // 미분류 배너
  unclassifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.warning + '12',
    borderWidth: 1,
    borderColor: Colors.warning + '40',
  },
  unclassifiedLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  unclassifiedText: { fontSize: 13, fontWeight: '600', color: Colors.warning },
  unclassifiedAction: { fontSize: 13, fontWeight: '600', color: Colors.warning },
});
