import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useRecipes } from '../../lib/hooks/useRecipes';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { RecipeWithIngredients } from '../../lib/services/recipes';
import { Ingredient } from '../../types';

type SortKey = 'name' | 'margin_desc' | 'cost_asc';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name', label: '이름순' },
  { key: 'margin_desc', label: '마진 높은 순' },
  { key: 'cost_asc', label: '원가 낮은 순' },
];

function RecipeCard({
  recipe,
  onDelete,
}: {
  recipe: RecipeWithIngredients;
  onDelete: (id: string) => void;
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

  return (
    <TouchableOpacity
      style={styles.recipeCard}
      onPress={() => router.push(`/recipes/${recipe.id}`)}
    >
      <View style={styles.recipeHeader}>
        <View style={styles.recipeLeft}>
          <Text style={styles.recipeName}>{recipe.name}</Text>
          <Text style={styles.recipeCategory}>{recipe.category}</Text>
        </View>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.recipeStats}>
        <View style={styles.recipeStat}>
          <Text style={styles.recipeStatLabel}>판매가</Text>
          <Text style={styles.recipeStatValue}>{recipe.selling_price.toLocaleString('ko-KR')}원</Text>
        </View>
        <View style={styles.recipeStat}>
          <Text style={styles.recipeStatLabel}>원가</Text>
          <Text style={styles.recipeStatValue}>{Math.round(currentCost).toLocaleString('ko-KR')}원</Text>
        </View>
        <View style={styles.recipeStat}>
          <Text style={styles.recipeStatLabel}>마진율</Text>
          <Text style={[styles.recipeStatValue, { color: marginColor }]}>
            {currentMarginRate.toFixed(1)}%
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function RecipesScreen() {
  const { data, loading, error, refetch, remove } = useRecipes();
  const { sort: sortParam } = useLocalSearchParams<{ sort?: string }>();

  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [activeCategory, setActiveCategory] = useState('전체');

  useFocusEffect(useCallback(() => {
    if (sortParam === 'margin') setSortBy('margin_desc');
    refetch();
  }, [sortParam]));

  const categories = ['전체', ...Array.from(new Set(data.map(r => r.category))).sort()];

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
        <TouchableOpacity style={styles.addButton} onPress={() => router.push('/recipes/new')}>
          <Text style={styles.addText}>+ 새 레시피</Text>
        </TouchableOpacity>
      </View>

      {data.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="restaurant-outline" size={48} color={Colors.gray300} style={styles.emptyIcon} />
          <Text style={styles.emptyText}>레시피가 없어요</Text>
          <Text style={styles.emptySubtext}>
            레시피를 등록하면 원가와{'\n'}마진율을 자동으로 계산해드려요
          </Text>
          <TouchableOpacity style={styles.addFirstButton} onPress={() => router.push('/recipes/new')}>
            <Text style={styles.addFirstText}>+ 첫 레시피 등록하기</Text>
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

          <FlatList
            data={displayed}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => <RecipeCard recipe={item} onDelete={remove} />}
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
  sortBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 6,
    flexDirection: 'row',
  },
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
    flex: 1,
    alignItems: 'center',
  },
  sortChipActive: {
    backgroundColor: Colors.dark,
    borderColor: Colors.dark,
  },
  sortChipText: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  sortChipTextActive: { color: Colors.white },
  categoryScroll: { flexGrow: 0 },
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
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  categoryChipActive: {
    backgroundColor: Colors.dark,
    borderColor: Colors.dark,
  },
  categoryChipText: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  categoryChipTextActive: { color: Colors.white },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  recipeCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.gray100,
    marginBottom: 12,
  },
  recipeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  recipeLeft: { flex: 1 },
  recipeName: { fontSize: 16, fontWeight: '700', color: Colors.black, marginBottom: 2 },
  recipeCategory: { fontSize: 13, color: Colors.gray500 },
  deleteBtn: { padding: 4 },
  deleteBtnText: { fontSize: 16, color: Colors.gray400 },
  recipeStats: { flexDirection: 'row', gap: 8 },
  recipeStat: {
    flex: 1,
    backgroundColor: Colors.gray50,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  recipeStatLabel: { fontSize: 11, color: Colors.gray500, marginBottom: 4 },
  recipeStatValue: { fontSize: 14, fontWeight: '700', color: Colors.black },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyIcon: { marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '700', color: Colors.gray700, marginBottom: 8 },
  emptySubtext: {
    fontSize: 14,
    color: Colors.gray400,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  addFirstButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  addFirstText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
});
