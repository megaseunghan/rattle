import { entityKey } from '../../lib/utils/listKeys';
import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { SheetModal } from '../../lib/components/ui/SheetModal';
import { getErrorMessage } from '../../lib/utils/error';
import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useRecipes } from '../../lib/hooks/useRecipes';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useStorePermissions } from '../../lib/hooks/useStorePermissions';
import { useTossSync } from '../../lib/hooks/useTossSync';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { CatalogImportModal } from '../../lib/components/CatalogImportModal';
import { BulkCategoryModal } from '../../lib/components/BulkCategoryModal';
import { Modal, TextInput } from 'react-native';
import { RecipeWithIngredients, upsertRecipesFromCatalog, getRecipesByCategory, renameRecipeCategory, deleteRecipeCategory } from '../../lib/services/recipes';
import { Ingredient, TossCatalogItem } from '../../types';
import { RecipeCard } from '../../lib/components/RecipeCard';
import { EmptyState } from '../../lib/components/ui';
import { recipeLineCost } from '../../lib/utils/unit';

type SortKey = 'name' | 'margin_desc' | 'cost_asc';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name', label: '이름순' },
  { key: 'margin_desc', label: '마진 높은 순' },
  { key: 'cost_asc', label: '원가 낮은 순' },
];

export default function RecipesScreen() {
  const { store } = useAuth();
  const { canManageRecipes } = useStorePermissions();
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
    refetch(false);
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
      Alert.alert('카탈로그 동기화 실패', getErrorMessage(e));
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
      Alert.alert('레시피 추가 실패', getErrorMessage(e));
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
      Alert.alert('오류', getErrorMessage(e));
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
      Alert.alert('오류', getErrorMessage(e));
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
            Alert.alert('오류', getErrorMessage(e));
          } finally {
            setCatOpLoading(false);
          }
        },
      },
    ]);
  }

  const displayed = useMemo(() => {
    return data
      .filter(r => activeCategory === '전체' || r.category === activeCategory)
      .sort((a, b) => {
        if (sortBy === 'margin_desc') return b.margin_rate - a.margin_rate;
        if (sortBy === 'cost_asc') return a.cost - b.cost;
        return a.name.localeCompare(b.name);
      });
  }, [data, activeCategory, sortBy]);

  const renderRecipe = useCallback(({ item }: { item: RecipeWithIngredients }) => (
    <RecipeCard recipe={item} onDelete={remove} isAdmin={canManageRecipes} />
  ), [remove, canManageRecipes]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;

  return (
    <SafeAreaView style={styles.container}><GlassBackdrop />
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
          {canManageRecipes && (
            <TouchableOpacity style={styles.addButton} onPress={() => router.push('/recipes/new')}>
              <Ionicons name="add" size={16} color={Colors.white} />
              <Text style={styles.addText}>새 레시피</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <CatalogImportModal
        visible={showCatalogImport}
        items={catalogItems}
        onConfirm={handleCatalogImportConfirm}
        onClose={() => setShowCatalogImport(false)}
      />

      {data.length === 0 ? (
        <EmptyState
          icon="restaurant-outline"
          title="등록된 레시피가 없어요"
          description="재료와 판매가를 입력하면 원가와 마진율을 확인할 수 있어요."
          ctaLabel={canManageRecipes ? '레시피 등록' : undefined}
          onCtaPress={canManageRecipes ? () => router.push('/recipes/new') : undefined}
        />
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
          <SheetModal visible={showCategoryModal} onRequestClose={() => setShowCategoryModal(false)}>
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

                      {canManageRecipes && (
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
          </SheetModal>

          <FlatList
            initialNumToRender={5}
            maxToRenderPerBatch={10}
            windowSize={5}
            data={displayed}
            keyExtractor={entityKey}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            extraData={canManageRecipes}
            renderItem={renderRecipe}
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
  container: { flex: 1, backgroundColor: Colors.homeCanvas},

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12, backgroundColor: 'transparent' },
  title: { fontSize: 22, fontWeight: '700', color: Colors.black, letterSpacing: -0.5, flexShrink: 1 },
  subtitle: { fontSize: 13, color: Colors.gray500, marginTop: 2 },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncButton: {
    width: 44,
    height: 44,
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
    borderRadius: 14, minHeight: 44, justifyContent: 'center' },
  addText: { color: Colors.white, fontSize: 14, fontWeight: '700' },

  // 정렬 바
  sortBar: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 6,
    flexDirection: 'row',
  },
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: Colors.white,
    flex: 1,
    alignItems: 'center',

     minHeight: 44, justifyContent: 'center', borderColor: Colors.homeBorder, borderWidth: 1 },
  sortChipActive: {
    backgroundColor: Colors.primary, borderColor: Colors.primary },
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
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 6,
    flexDirection: 'row',
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: Colors.white,

     minHeight: 44, justifyContent: 'center', borderColor: Colors.homeBorder, borderWidth: 1 },
  categoryChipActive: {
    backgroundColor: Colors.primary, borderColor: Colors.primary },
  categoryChipText: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  categoryChipTextActive: { color: Colors.white },
  editCatBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    marginRight: 4,
    borderRadius: 14,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.homeBorder },

  // 카테고리 모달
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.homeCanvas,
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
    width: 44,
    height: 44,
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
    marginRight: 8, minHeight: 44 },
  catActions: { flexDirection: 'row', gap: 4 },
  catActionBtn: {
    width: 44,
    height: 44,
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
    marginRight: 4, minHeight: 44, justifyContent: 'center' },
  catConfirmText: { fontSize: 13, color: Colors.white, fontWeight: '700' },

  // 레시피 리스트
  listContent: { paddingHorizontal: 20, paddingBottom: 32 },

  // 미분류 배너
  unclassifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.warning + '12',
    borderWidth: 1,
    borderColor: Colors.warning + '40', minHeight: 44 },
  unclassifiedLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  unclassifiedText: { fontSize: 13, fontWeight: '600', color: Colors.warning },
  unclassifiedAction: { fontSize: 13, fontWeight: '600', color: Colors.warning },
});
