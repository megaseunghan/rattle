import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useStorePermissions } from '../../lib/hooks/useStorePermissions';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { useRecipes } from '../../lib/hooks/useRecipes';
import { Ingredient } from '../../types';
import { formatStock } from '../../lib/utils/unit';
import { RecipeCard } from '../../lib/components/RecipeCard';

type ContentTab = '재고현황' | '레시피';

// ─── 재고 행 (프로그레스 바 포함) ───────────────────────────────
function IngredientRow({ item }: { item: Ingredient }) {
  const ratio = item.min_stock > 0 ? item.current_stock / item.min_stock : 1;
  const capped = Math.min(ratio, 1);
  const isDanger = ratio <= 0.2;
  const isWarn = ratio > 0.2 && ratio <= 1;

  const barColor = isDanger ? '#E24B4A' : isWarn ? '#EF9F27' : Colors.primary;
  const iconBg = isDanger ? '#FCEBEB' : isWarn ? '#FAEEDA' : Colors.tinted;
  const iconColor = isDanger ? '#A32D2D' : isWarn ? '#854F0B' : Colors.primary;

  return (
    <TouchableOpacity
      style={styles.ingredientRow}
      onPress={() => router.push(`/stock/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <Ionicons name="cube-outline" size={18} color={iconColor} />
      </View>
      <View style={styles.ingredientInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.ingredientName}>{item.name}</Text>
          <View style={[
            styles.badge,
            isDanger ? styles.badgeDanger : isWarn ? styles.badgeWarn : styles.badgeOk,
          ]}>
            <Text style={[
              styles.badgeText,
              isDanger ? styles.badgeTextDanger : isWarn ? styles.badgeTextWarn : styles.badgeTextOk,
            ]}>
              {isDanger ? '부족' : isWarn ? '임박' : '정상'}
            </Text>
          </View>
        </View>
        <Text style={styles.ingredientSub}>
          잔여 {formatStock(item.current_stock, item)}
          {item.min_stock > 0 ? ` / 기준 ${item.min_stock}${item.unit}` : ''}
        </Text>
        {item.min_stock > 0 && (
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${capped * 100}%` as any, backgroundColor: barColor }]} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── 메인 스크린 ──────────────────────────────────────────────
export default function StockScreen() {
  const [activeTab, setActiveTab] = useState<ContentTab>('재고현황');
  const [activeCategory, setActiveCategory] = useState('전체');

  const {
    data: ingredients, loading: ingLoading,
    loadingMore, hasMore, loadMore, refetch: refetchIng,
  } = useIngredients();
  const { data: recipes, loading: recLoading, refetch: refetchRec, remove: removeRecipe } = useRecipes();
  const { canManageRecipes } = useStorePermissions();

  // 파트타이머는 레시피 세그먼트 접근 불가
  const contentTabs: ContentTab[] = canManageRecipes
    ? ['재고현황', '레시피']
    : ['재고현황'];

  useFocusEffect(useCallback(() => {
    if (activeTab === '재고현황') refetchIng();
    else refetchRec();
  }, [activeTab, refetchIng, refetchRec]));

  const categories = ['전체', ...Array.from(new Set(ingredients.map(i => i.category))).sort()];
  const filtered = (activeCategory === '전체' ? ingredients : ingredients.filter(i => i.category === activeCategory))
    .slice()
    .sort((a, b) => {
      const aLow = a.current_stock <= a.min_stock ? 0 : 1;
      const bLow = b.current_stock <= b.min_stock ? 0 : 1;
      return aLow - bLow || a.name.localeCompare(b.name);
    });

  const lowStockCount = ingredients.filter(i => i.current_stock <= i.min_stock).length;
  const isLoading = activeTab === '재고현황' ? ingLoading : recLoading;

  function handleFab() {
    if (activeTab === '재고현황') router.push('/stock/new');
    else router.push('/recipes/new');
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.title}>재고</Text>
          {lowStockCount > 0 && (
            <Text style={styles.lowStockHint}>품절 임박 {lowStockCount}개</Text>
          )}
        </View>
      </View>

      {/* 콘텐츠 탭 */}
      <View style={styles.contentTabRow}>
        {contentTabs.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.contentTab, activeTab === tab && styles.contentTabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.contentTabText, activeTab === tab && styles.contentTabTextActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 카테고리 필터 */}
      {activeTab === '재고현황' && categories.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.catScroll}
          contentContainerStyle={styles.catBar}
        >
          {categories.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.catTab, activeCategory === cat && styles.catTabActive]}
              onPress={() => setActiveCategory(cat)}
            >
              <Text style={[styles.catTabText, activeCategory === cat && styles.catTabTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* 리스트 */}
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : activeTab === '재고현황' ? (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <IngredientRow item={item} />}
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={<EmptyState icon="cube-outline" text="재고 데이터가 없어요" />}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: 16 }} color={Colors.primary} /> : null}
        />
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <RecipeCard recipe={item} onDelete={removeRecipe} isAdmin={canManageRecipes} />}
          ListEmptyComponent={<EmptyState icon="restaurant-outline" text="레시피가 없어요" />}
        />
      )}

      {/* FAB (레시피 세그먼트는 파트타이머에게 숨김) */}
      {!(activeTab === '레시피' && !canManageRecipes) && (
        <TouchableOpacity style={styles.fab} onPress={handleFab} activeOpacity={0.85}>
          <Ionicons name="add" size={26} color={Colors.white} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

function EmptyState({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={32} color={Colors.gray300} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.gray100,
  },
  title: { fontSize: 17, fontWeight: '600', color: Colors.black },
  lowStockHint: { fontSize: 11, color: Colors.warning, marginTop: 1 },

  contentTabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
    backgroundColor: Colors.white,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.gray100,
  },
  contentTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: Colors.gray200,
    backgroundColor: Colors.gray50,
  },
  contentTabActive: { backgroundColor: Colors.black, borderColor: Colors.black },
  contentTabText: { fontSize: 13, color: Colors.gray500 },
  contentTabTextActive: { color: Colors.white, fontWeight: '500' },

  catScroll: { flexGrow: 0, flexShrink: 0 },
  catBar: { paddingHorizontal: 16, paddingVertical: 10, gap: 6, flexDirection: 'row', alignItems: 'center' },
  catTab: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 0.5,
    borderColor: Colors.gray200,
  },
  catTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catTabText: { fontSize: 12, fontWeight: '500', color: Colors.gray500 },
  catTabTextActive: { color: Colors.white },

  listContent: { padding: 16, paddingBottom: 100 },

  // 재고 행
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.gray100,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  ingredientInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  ingredientName: { fontSize: 14, fontWeight: '500', color: Colors.black },
  ingredientSub: { fontSize: 11, color: Colors.gray400, marginBottom: 6 },
  progressBg: { height: 4, backgroundColor: Colors.gray100, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },

  // 뱃지
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  badgeDanger: { backgroundColor: '#FCEBEB' },
  badgeWarn: { backgroundColor: '#FAEEDA' },
  badgeOk: { backgroundColor: '#EAF3DE' },
  badgeText: { fontSize: 10, fontWeight: '600' },
  badgeTextDanger: { color: '#A32D2D' },
  badgeTextWarn: { color: '#854F0B' },
  badgeTextOk: { color: '#3B6D11' },

  // 기타
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { paddingTop: 60, alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 15, color: Colors.gray400 },

  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
