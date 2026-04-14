import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useRecipes } from '../../lib/hooks/useRecipes';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTossSync } from '../../lib/hooks/useTossSync';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { CatalogImportModal } from '../../lib/components/CatalogImportModal';
import { BulkCategoryModal } from '../../lib/components/BulkCategoryModal';
import { Modal, TextInput } from 'react-native';
import { RecipeWithIngredients, upsertRecipesFromCatalog, getRecipesByCategory, renameRecipeCategory, deleteRecipeCategory } from '../../lib/services/recipes';
import { Ingredient, TossCatalogItem } from '../../types';

type SortKey = 'name' | 'margin_desc' | 'cost_asc';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name', label: '이름순' },
  { key: 'margin_desc', label: '마진 높은 순' },
  { key: 'cost_asc', label: '원가 낮은 순' },
];

function RecipeCard({
  recipe,
  onDelete,
  isAdmin = true,
}: {
  recipe: RecipeWithIngredients;
  onDelete: (id: string) => void;
  isAdmin?: boolean;
}) {
  function handleDelete() {
    Alert.alert('레시피 삭제', `"${recipe.name}"을(를) 삭제하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => onDelete(recipe.id) },
    ]);
  }

  function unitPrice(ing: Ingredient): number {
    const base = ing.last_price ?? 0;
    if (ing.container_size && ing.container_size > 0) return base / ing.container_size;
    return base;
  }

  const currentCost = useMemo(() => {
    return recipe.recipe_ingredients.reduce((sum, ri) => {
      if (!ri.ingredient) return sum;
      return sum + ri.quantity * unitPrice(ri.ingredient);
    }, 0);
  }, [recipe]);

  const currentMarginRate = useMemo(() => {
    if (recipe.selling_price <= 0) return 0;
    return Math.max(0, ((recipe.selling_price - currentCost) / recipe.selling_price) * 100);
  }, [recipe.selling_price, currentCost]);

  const marginColor = currentMarginRate >= 60
    ? Colors.success
    : currentMarginRate >= 30
    ? Colors.warning
    : Colors.danger;

  const marginBarWidth = `${Math.min(Math.max(currentMarginRate, 0), 100)}%` as `${number}%`;

  return (
    <TouchableOpacity
      style={styles.recipeCard}
      onPress={() => router.push(`/recipes/${recipe.id}`)}
      activeOpacity={0.75}
    >
      <View style={styles.recipeHeader}>
        <View style={styles.recipeLeft}>
          <Text style={styles.recipeName}>{recipe.name}</Text>
          <View style={styles.categoryPill}>
            <Text style={styles.categoryPillText}>{recipe.category}</Text>
          </View>
        </View>
        {isAdmin && (
          <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={15} color={Colors.gray300} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.recipeStats}>
        <View style={styles.recipeStat}>
          <Text style={styles.recipeStatLabel}>판매가</Text>
          <Text style={styles.recipeStatValue}>{recipe.selling_price.toLocaleString('ko-KR')}원</Text>
        </View>
        <View style={styles.recipeStatDivider} />
        <View style={styles.recipeStat}>
          <Text style={styles.recipeStatLabel}>원가</Text>
          <Text style={styles.recipeStatValue}>{Math.round(currentCost).toLocaleString('ko-KR')}원</Text>
        </View>
        <View style={styles.recipeStatDivider} />
        <View style={styles.recipeStat}>
          <Text style={styles.recipeStatLabel}>마진율</Text>
          <Text style={[styles.recipeStatValue, styles.recipeStatMargin, { color: marginColor }]}>
            {currentMarginRate.toFixed(1)}%
          </Text>
        </View>
      </View>

      {/* 마진율 시각 바 */}
      <View style={styles.marginBarTrack}>
        <View style={[styles.marginBarFill, { width: marginBarWidth, backgroundColor: marginColor }]} />
      </View>
    </TouchableOpacity>
  );
}

export default function RecipesScreen() {
  const { store, currentRole } = useAuth();
  const isAdmin = currentRole === 'admin';
  const { data, loading, loadingMore, hasMore, loadMore, error, refetch, remove, bulkUpdateCategory } = useRecipes();
  const { syncCatalog } = useTossSync();
  const { sort: sortParam } = useLocalSearchParams<{ sort?: string }>();

  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [activeCategory, setActiveCategory] = useState('전체');
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [catalogItems, setCatalogItems] = useState<TossCatalogItem[]>([]);
  const [showCatalogImport, setShowCatalogImport] = useState(false);
  const [showBulkCat, setShowBulkCat] = useState(false);
  const [bulkCatItems, setBulkCatItems] = useState<{ id: string; name: string }[]>([]);
  const [loadingBulkCat, setLoadingBulkCat] = useState(false);
  const [unclassifiedCount, setUnclassifiedCount] = useState(0);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [catOpLoading, setCatOpLoading] = useState(false);

  useFocusEffect(useCallback(() => {
    if (sortParam === 'margin') setSortBy('margin_desc');
    refetch();
    if (store) {
      getRecipesByCategory(store.id, '미분류').then(items => setUnclassifiedCount(items.length));
    }
  }, [sortParam, store]));

  async function handleSyncCatalog() {
    setSyncingCatalog(true);
    try {
      const items = await syncCatalog();
      const existingNames = new Set(data.map(r => r.name));
      setCatalogItems(items.filter(i => !existingNames.has(i.itemName)));
      setShowCatalogImport(true);
    } catch (e: any) {
      Alert.alert('카탈로그 동기화 실패', e.message);
    } finally {
      setSyncingCatalog(false);
    }
  }

  async function handleCatalogImportConfirm(selectedItems: TossCatalogItem[]) {
    if (!store) return;
    try {
      const count = await upsertRecipesFromCatalog(
        store.id,
        selectedItems.map(i => ({
          name: i.itemName,
          category: i.categoryName || '미분류',
          sellingPrice: i.price,
        }))
      );
      setShowCatalogImport(false);
      await refetch();
      Alert.alert('완료', `${count}개 품목이 레시피에 추가/업데이트되었습니다.`);
    } catch (e: any) {
      Alert.alert('레시피 추가 실패', e.message);
    }
  }

  async function handleOpenBulkCat() {
    if (!store) return;
    setLoadingBulkCat(true);
    try {
      const items = await getRecipesByCategory(store.id, '미분류');
      setBulkCatItems(items);
      setUnclassifiedCount(items.length);
      setShowBulkCat(true);
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setLoadingBulkCat(false);
    }
  }

  const categories = ['전체', ...Array.from(new Set(data.map(r => r.category))).sort()];

  async function handleRenameCategory() {
    const newName = editingCatName.trim();
    if (!newName || !editingCat || !store) return;
    if (newName === editingCat) { setEditingCat(null); return; }
    setCatOpLoading(true);
    try {
      await renameRecipeCategory(store.id, editingCat, newName);
      setEditingCat(null);
      await refetch();
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setCatOpLoading(false);
    }
  }

  async function handleDeleteCategory(name: string) {
    if (!store) return;
    const count = data.filter(r => r.category === name).length;
    const message = count > 0
      ? `"${name}" 카테고리를 삭제하면 해당 레시피 ${count}개가 '미분류'로 이동됩니다.`
      : `"${name}" 카테고리를 삭제하시겠습니까?`;

    Alert.alert('카테고리 삭제', message, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          setCatOpLoading(true);
          try {
            await deleteRecipeCategory(store.id, name);
            await refetch();
          } catch (e: any) {
            Alert.alert('오류', e.message);
          } finally {
            setCatOpLoading(false);
          }
        },
      },
    ]);
  }

  function unitPrice(ing: Ingredient): number {
    const base = ing.last_price ?? 0;
    if (ing.container_size && ing.container_size > 0) return base / ing.container_size;
    return base;
  }

  const displayed = useMemo(() => {
    return data
      .filter(r => activeCategory === '전체' || r.category === activeCategory)
      .map(r => {
        const cost = r.recipe_ingredients.reduce((sum, ri) => {
          if (!ri.ingredient) return sum;
          return sum + ri.quantity * unitPrice(ri.ingredient);
        }, 0);
        const marginRate = r.selling_price > 0 ? ((r.selling_price - cost) / r.selling_price) * 100 : 0;
        return { ...r, calculatedCost: cost, calculatedMarginRate: marginRate };
      })
      .sort((a, b) => {
        if (sortBy === 'margin_desc') return b.calculatedMarginRate - a.calculatedMarginRate;
        if (sortBy === 'cost_asc') return a.calculatedCost - b.calculatedCost;
        return a.name.localeCompare(b.name);
      });
  }, [data, activeCategory, sortBy]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>레시피</Text>
          {data.length > 0 && <Text style={styles.subtitle}>{data.length}개</Text>}
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.syncButton, syncingCatalog && styles.syncButtonDisabled]}
            onPress={handleSyncCatalog}
            disabled={syncingCatalog}
          >
            {syncingCatalog
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name="sync-outline" size={17} color={Colors.primary} />
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={() => router.push('/recipes/new')}>
            <Ionicons name="add" size={16} color={Colors.white} />
            <Text style={styles.addText}>새 레시피</Text>
          </TouchableOpacity>
        </View>
      </View>

      <CatalogImportModal
        visible={showCatalogImport}
        items={catalogItems}
        onConfirm={handleCatalogImportConfirm}
        onClose={() => setShowCatalogImport(false)}
      />

      {data.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconBg}>
            <Ionicons name="restaurant-outline" size={28} color={Colors.gray400} />
          </View>
          <Text style={styles.emptyText}>레시피가 없어요</Text>
          <Text style={styles.emptySubtext}>
            레시피를 등록하면 원가와{'\n'}마진율을 자동으로 계산해드려요
          </Text>
          <TouchableOpacity style={styles.addFirstButton} onPress={() => router.push('/recipes/new')}>
            <Text style={styles.addFirstText}>첫 레시피 등록하기</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* 정렬 옵션 */}
          <View style={styles.sortBar}>
            {SORT_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.sortChip, sortBy === opt.key && styles.sortChipActive]}
                onPress={() => setSortBy(opt.key)}
              >
                <Text style={[styles.sortChipText, sortBy === opt.key && styles.sortChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 카테고리 필터 */}
          <View style={styles.tabRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryBar}
              style={styles.categoryScroll}
            >
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryChip, activeCategory === cat && styles.categoryChipActive]}
                  onPress={() => setActiveCategory(cat)}
                >
                  <Text style={[styles.categoryChipText, activeCategory === cat && styles.categoryChipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {categories.length > 1 && (
              <TouchableOpacity
                style={styles.editCatBtn}
                onPress={() => setShowCategoryModal(true)}
              >
                <Ionicons name="settings-outline" size={15} color={Colors.gray500} />
              </TouchableOpacity>
            )}
          </View>

          {unclassifiedCount > 0 && (
            <TouchableOpacity
              style={styles.unclassifiedBanner}
              onPress={handleOpenBulkCat}
              disabled={loadingBulkCat}
              activeOpacity={0.75}
            >
              <View style={styles.unclassifiedLeft}>
                <Ionicons name="folder-open-outline" size={15} color={Colors.warning} />
                <Text style={styles.unclassifiedText}>미분류 {unclassifiedCount}개</Text>
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
            categories={categories.filter(c => c !== '전체')}
            onConfirm={async (ids, category) => {
              await bulkUpdateCategory(ids, category);
              setShowBulkCat(false);
            }}
            onClose={() => setShowBulkCat(false)}
          />

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
                  <Text style={styles.modalTitle}>카테고리 관리</Text>
                  <TouchableOpacity onPress={() => setShowCategoryModal(false)} style={styles.modalCloseBtn}>
                    <Ionicons name="close" size={20} color={Colors.gray500} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScroll}>
                  {categories.filter(c => c !== '전체').map(cat => (
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

                      {isAdmin && (
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
                      )}
                    </View>
                  ))}
                  <View style={{ height: 40 }} />
                </ScrollView>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>

          <FlatList
            data={displayed}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => <RecipeCard recipe={item} onDelete={remove} isAdmin={isAdmin} />}
            onEndReached={hasMore ? loadMore : undefined}
            onEndReachedThreshold={0.5}
            ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: 16 }} color={Colors.primary} /> : null}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.black, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: Colors.gray400, marginTop: 2 },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.tinted,
    borderWidth: 1.5,
    borderColor: Colors.primary + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncButtonDisabled: { opacity: 0.5 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  addText: { color: Colors.white, fontSize: 14, fontWeight: '700' },

  // 정렬 바
  sortBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 6,
    flexDirection: 'row',
  },
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.white,
    flex: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  sortChipActive: {
    backgroundColor: Colors.dark,
  },
  sortChipText: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  sortChipTextActive: { color: Colors.white },

  // 카테고리 바
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    marginBottom: 4,
  },
  categoryScroll: { flex: 1 },
  categoryBar: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 6,
    flexDirection: 'row',
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  categoryChipActive: {
    backgroundColor: Colors.primary,
  },
  categoryChipText: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  categoryChipTextActive: { color: Colors.white },
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

  // 카테고리 모달
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
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

  // 레시피 리스트
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  recipeCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  recipeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  recipeLeft: { flex: 1, gap: 6 },
  recipeName: { fontSize: 16, fontWeight: '700', color: Colors.black },
  categoryPill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.gray100,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryPillText: { fontSize: 11, fontWeight: '600', color: Colors.gray500 },
  deleteBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // 스탯
  recipeStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  recipeStat: {
    flex: 1,
    alignItems: 'center',
  },
  recipeStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.gray100,
  },
  recipeStatLabel: { fontSize: 11, color: Colors.gray400, marginBottom: 4, fontWeight: '500' },
  recipeStatValue: { fontSize: 14, fontWeight: '700', color: Colors.black },
  recipeStatMargin: { fontSize: 15 },

  // 마진율 바
  marginBarTrack: {
    height: 4,
    backgroundColor: Colors.gray100,
    borderRadius: 2,
    overflow: 'hidden',
  },
  marginBarFill: {
    height: 4,
    borderRadius: 2,
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
  emptySubtext: {
    fontSize: 14,
    color: Colors.gray400,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
  },
  addFirstButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  addFirstText: { color: Colors.white, fontSize: 15, fontWeight: '700' },

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
