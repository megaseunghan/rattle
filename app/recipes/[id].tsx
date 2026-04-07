import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { getRecipeById, deleteRecipe } from '../../lib/services/recipes';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { RecipeWithIngredients } from '../../lib/services/recipes';
import { Ingredient } from '../../types';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recipe, setRecipe] = useState<RecipeWithIngredients | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadRecipe = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getRecipeById(id);
      setRecipe(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    loadRecipe();
  }, [loadRecipe]));

  function unitPrice(ing: Ingredient): number {
    const base = ing.last_price ?? 0;
    if (ing.container_size && ing.container_size > 0) return base / ing.container_size;
    return base;
  }

  async function handleDelete() {
    Alert.alert('레시피 삭제', `"${recipe?.name}" 레시피를 삭제하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            setSaving(true);
            await deleteRecipe(id);
            router.back();
          } catch (e: any) {
            Alert.alert('삭제 실패', e.message);
          } finally {
            setSaving(false);
          }
        }
      }
    ]);
  }

  if (loading) return <LoadingSpinner />;
  if (error || !recipe) return <ErrorMessage message={error || '레시피를 찾을 수 없습니다.'} onRetry={loadRecipe} />;

  const marginColor = recipe.margin_rate >= 60
    ? Colors.success
    : recipe.margin_rate >= 30
    ? Colors.warning
    : Colors.danger;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>레시피 상세</Text>
        <TouchableOpacity 
          onPress={() => router.push({ pathname: '/recipes/new', params: { id } })}
          style={styles.editBtn}
        >
          <Text style={styles.editText}>수정</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <View style={styles.recipeHeader}>
            <View>
              <Text style={styles.recipeName}>{recipe.name}</Text>
              <Text style={styles.recipeCategory}>{recipe.category}</Text>
            </View>
            <View style={styles.priceBadge}>
              <Text style={styles.priceValue}>{recipe.selling_price.toLocaleString()}원</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>원가</Text>
              <Text style={styles.statValue}>{recipe.cost.toLocaleString()}원</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>마진</Text>
              <Text style={styles.statValue}>{(recipe.selling_price - recipe.cost).toLocaleString()}원</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>마진율</Text>
              <Text style={[styles.statValue, { color: marginColor }]}>{recipe.margin_rate.toFixed(1)}%</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>재료 목록</Text>
        <View style={styles.ingredientsCard}>
          {recipe.recipe_ingredients.map((ri, idx) => (
            <View key={idx} style={[styles.riRow, idx > 0 && styles.riBorder]}>
              <View style={styles.riLeft}>
                <Text style={styles.riName}>{ri.ingredient?.name}</Text>
                <Text style={styles.riQuantity}>{ri.quantity}{ri.unit}</Text>
              </View>
              <View style={styles.riRight}>
                <Text style={styles.riCost}>
                  {(unitPrice(ri.ingredient!) * ri.quantity).toLocaleString(undefined, { maximumFractionDigits: 0 })}원
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.deleteContainer}>
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color={Colors.danger} /> : <Text style={styles.deleteBtnText}>레시피 삭제</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  editBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-end' },
  editText: { fontSize: 15, fontWeight: '600', color: Colors.primary },
  title: { fontSize: 17, fontWeight: '700', color: Colors.black },
  scroll: { padding: 20, paddingBottom: 48 },
  card: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 20,
    borderWidth: 1, borderColor: Colors.gray100, marginBottom: 24,
  },
  recipeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recipeName: { fontSize: 20, fontWeight: '800', color: Colors.black, marginBottom: 4 },
  recipeCategory: { fontSize: 14, color: Colors.gray500 },
  priceBadge: { backgroundColor: Colors.primary + '15', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  priceValue: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  divider: { height: 1, backgroundColor: Colors.gray100, marginVertical: 20 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statBox: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 12, color: Colors.gray500, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: '700', color: Colors.black },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.black, marginBottom: 12 },
  ingredientsCard: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.gray100, overflow: 'hidden',
  },
  riRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  riBorder: { borderTopWidth: 1, borderTopColor: Colors.gray100 },
  riLeft: { flex: 1 },
  riName: { fontSize: 15, fontWeight: '600', color: Colors.black, marginBottom: 2 },
  riQuantity: { fontSize: 13, color: Colors.gray500 },
  riRight: { alignItems: 'flex-end' },
  riCost: { fontSize: 15, fontWeight: '700', color: Colors.black },
  deleteContainer: { marginTop: 40, alignItems: 'center' },
  deleteBtn: {
    paddingVertical: 12, paddingHorizontal: 40, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.danger,
  },
  deleteBtnText: { color: Colors.danger, fontSize: 15, fontWeight: '600' },
});
