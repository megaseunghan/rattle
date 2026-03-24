import { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useRecipes } from '../../lib/hooks/useRecipes';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { RecipeWithIngredients } from '../../lib/services/recipes';

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

  const marginColor = recipe.margin_rate >= 60
    ? Colors.success
    : recipe.margin_rate >= 30
    ? Colors.warning
    : Colors.danger;

  return (
    <View style={styles.recipeCard}>
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
          <Text style={styles.recipeStatValue}>{recipe.cost.toLocaleString('ko-KR')}원</Text>
        </View>
        <View style={styles.recipeStat}>
          <Text style={styles.recipeStatLabel}>마진율</Text>
          <Text style={[styles.recipeStatValue, { color: marginColor }]}>
            {recipe.margin_rate.toFixed(1)}%
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function RecipesScreen() {
  const { data, loading, error, refetch, remove } = useRecipes();
  useFocusEffect(useCallback(() => { refetch(); }, []));

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>레시피</Text>
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
        <FlatList
          data={data}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <RecipeCard recipe={item} onDelete={remove} />}
        />
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
  addButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  listContent: { padding: 16, gap: 12 },
  recipeCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.gray100,
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
