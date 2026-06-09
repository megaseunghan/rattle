import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { RecipeWithIngredients } from '../services/recipes';
import { Ingredient } from '../../types';

function unitPrice(ing: Ingredient): number {
  const base = ing.last_price ?? 0;
  if (ing.container_size && ing.container_size > 0) return base / ing.container_size;
  return base;
}

/**
 * 레시피 카드 — 재고의 last_price 기준으로 원가·마진율을 실시간 계산해 표시.
 * 재고 허브(레시피 세그먼트)와 레시피 단독 화면에서 공용으로 사용.
 */
export function RecipeCard({
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

const styles = StyleSheet.create({
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
});
