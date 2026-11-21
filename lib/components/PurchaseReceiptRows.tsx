import { useState } from 'react';
import { useReceiptIngredientSearch } from '../hooks/useReceiptIngredientSearch';
import { Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/colors';
import type { Ingredient } from '../../types';

export interface ReceiptDraftRow {
  id: string;
  name: string;
  inputName?: string;
  category?: string;
  unit?: string;
  amount: string;
  quantity: string;
  ingredient?: Ingredient;
  removed?: boolean;
}

export function PurchaseReceiptRows({ rows, change, create, inventory, complete, storeId, focus, used, categories, defaultCategory }: {
  rows: ReceiptDraftRow[];
  categories: string[];
  defaultCategory: string;
  change: (id: string, patch: Partial<ReceiptDraftRow>) => void;
  create: (row: ReceiptDraftRow, name: string) => void;
  inventory: Ingredient[];
  complete: boolean;
  storeId: string;
  focus: (target: number) => void;
  used: (ingredientId: string, rowId: string) => boolean;
}) {
  const [limit, setLimit] = useState(5);
  const [activeId, setActiveId] = useState<string>();
  const active = rows.find(row => row.id === activeId);
  const term = (active?.ingredient?.name ?? active?.inputName ?? active?.name ?? '').trim();
  const { result, retry } = useReceiptIngredientSearch(storeId, term, inventory, complete);
  return <View style={styles.table}>
    <View style={styles.line}><Text style={styles.cell}>항목</Text><Text style={styles.cell}>금액 (원)</Text></View>
    {!rows.length && <Text>품목을 직접 입력해 주세요.</Text>}
    {rows.map((row, index) => {
      const label = row.name || (index + 1) + '번째';
      return <View key={row.id} style={styles.row}>
      <View style={styles.line}>
        <TextInput style={styles.input} accessibilityLabel={label + ' 항목명'}
          value={row.ingredient?.name ?? row.inputName ?? row.name} placeholder="재고 품목 검색" selectTextOnFocus
          onFocus={event => { setLimit(5); setActiveId(row.id); focus(event.nativeEvent.target); }}
          onBlur={() => setActiveId(undefined)}
          onChangeText={inputName => { setLimit(5); setActiveId(row.id); change(row.id, { inputName, ingredient: undefined }); }} />
        <TextInput style={styles.input} value={row.amount} accessibilityLabel={label + ' 금액'} keyboardType="number-pad"
          placeholder="금액" onChangeText={amount => change(row.id, { amount })} />
      </View>
      {row.id === activeId && !!term && <View>
        {result?.failed ? <TouchableOpacity style={styles.option} onPress={retry}><Text>검색 실패 · 다시 시도</Text></TouchableOpacity>
          : !result?.matches ? <Text>품목을 찾고 있어요…</Text>
          : result.matches.length === 0 ? <TouchableOpacity accessibilityRole="button" style={styles.option} onPress={() => {
            setActiveId(undefined); Keyboard.dismiss(); create(row, term);
          }}><Text style={styles.link}>새 품목으로 추가</Text></TouchableOpacity>
          : result.matches.slice(0, limit).map(item => {
            const already = used(item.id, row.id);
            return <TouchableOpacity accessibilityRole="button" disabled={already} key={item.id} style={styles.option}
              onPress={() => { change(row.id, { ingredient: item, inputName: item.name }); setActiveId(undefined); Keyboard.dismiss(); }}>
              <Text>{item.name} · {item.unit}{already && ' · 이미 추가됨'}</Text>
            </TouchableOpacity>;
          })}
        {result?.matches && result.matches.length > limit && <TouchableOpacity accessibilityRole="button" style={styles.option}
          onPress={() => setLimit(count => count + 5)}><Text style={styles.link}>검색 결과 더 보기</Text></TouchableOpacity>}
      </View>}
      <View style={styles.choices}>
        {categories.map(name => <TouchableOpacity key={name} accessibilityRole="radio" accessibilityLabel={label + ' 카테고리 ' + name}
          accessibilityState={{ checked: (row.category ?? defaultCategory) === name }}
          onPress={() => change(row.id, { category: name })} style={[styles.choice, (row.category ?? defaultCategory) === name && styles.selected]}>
          <Text>{name}</Text></TouchableOpacity>)}
      </View>
      <View style={styles.line}>
        <View style={styles.cell}><Text>수량 (선택)</Text>
          <TextInput style={styles.input} value={row.quantity} accessibilityLabel={label + ' 수량'} keyboardType="decimal-pad"
            placeholder="기본 1" onChangeText={quantity => change(row.id, { quantity })} /></View>
        <View style={styles.cell}><Text>단위 (선택)</Text><TextInput style={styles.input} accessibilityLabel={label + ' 단위'}
          value={row.ingredient?.unit ?? row.unit ?? ''} editable={!row.ingredient} placeholder="예: 개"
          onChangeText={unit => change(row.id, { unit })} /></View>
        <Text style={styles.cell}>단가 {row.amount && Number(row.quantity || 1) > 0 && Number.isFinite(Number(row.amount) / Number(row.quantity || 1))
          ? Math.round(Number(row.amount) / Number(row.quantity || 1)).toLocaleString() + '원' : '—'}</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={label + ' 행 삭제'} onPress={() => change(row.id, { removed: true })} style={styles.delete}><Text>삭제</Text></TouchableOpacity>
    </View>; })}
  </View>;
}
const styles = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  choice: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 8 }, selected: { backgroundColor: Colors.gray200 },
  option: { minHeight: 44, justifyContent: 'center' },
  table: { gap: 8 }, line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: { paddingVertical: 8, borderTopWidth: 1, borderColor: Colors.gray200, gap: 6 },
  cell: { flex: 1 }, input: { flex: 1, minHeight: 44, borderBottomWidth: 1, borderColor: Colors.gray300 },
  link: { color: Colors.action }, delete: { minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center' },
});
