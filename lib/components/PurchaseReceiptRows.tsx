import { useState } from 'react';
import { useReceiptIngredientSearch } from '../hooks/useReceiptIngredientSearch';
import { Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/colors';
import type { Ingredient } from '../../types';

export interface ReceiptDraftRow {
  id: string;
  name: string;
  inputName?: string;
  amount: string;
  quantity: string;
  needsReview?: boolean;
  suggestedAmount?: number;
  printedPrice?: number;
  amountSource?: 'observed' | 'derived';
  warnings?: string[];
  ingredient?: Ingredient;
  removed?: boolean;
}

export function PurchaseReceiptRows({ rows, change, create, inventory, complete, storeId, focus, used }: {
  rows: ReceiptDraftRow[];
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
    {rows.some(row => row.name) && <Text>사진에서 읽은 내용이에요. 맞는지 확인해 주세요.</Text>}
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
          placeholder="금액" onChangeText={amount => change(row.id, { amount, needsReview: !amount.trim() && row.suggestedAmount !== undefined })} />
      </View>
      {!!row.name && !row.ingredient && row.inputName !== undefined && row.inputName !== row.name && <Text>사진 속 이름 · {row.name}</Text>}
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
      {row.needsReview && <Text accessibilityRole="alert">확인 필요</Text>}
      {row.needsReview && row.suggestedAmount !== undefined &&
        <TouchableOpacity accessibilityRole="button" style={styles.option} onPress={() => change(row.id, { amount: String(row.suggestedAmount), needsReview: false })}>
          <Text style={{ color: Colors.gray600 }}>{row.amountSource === 'derived' ? '계산 금액' : '읽은 금액'} {row.suggestedAmount.toLocaleString()}원 적용</Text>
        </TouchableOpacity>}
      {row.printedPrice !== undefined && <Text>표시 가격 {row.printedPrice.toLocaleString()}원</Text>}
      {row.needsReview && row.warnings?.map(message => <Text key={message}>{message}</Text>)}
      <View style={styles.line}>
        <View style={styles.cell}><Text>수량 (선택){row.ingredient && ' (' + row.ingredient.unit + ')'}</Text>
          <TextInput style={styles.input} value={row.quantity} accessibilityLabel={label + ' 수량'} keyboardType="decimal-pad"
            placeholder="기본 1" onChangeText={quantity => change(row.id, { quantity })} /></View>
        <Text style={styles.cell}>단가 {row.amount && Number(row.quantity || 1) > 0 && Number.isFinite(Number(row.amount) / Number(row.quantity || 1))
          ? Math.round(Number(row.amount) / Number(row.quantity || 1)).toLocaleString() + '원' : '—'}</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={label + ' 행 삭제'} onPress={() => change(row.id, { removed: true })} style={styles.delete}><Text>삭제</Text></TouchableOpacity>
    </View>; })}
  </View>;
}
const styles = StyleSheet.create({
  option: { minHeight: 44, justifyContent: 'center' },
  table: { gap: 8 }, line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: { paddingVertical: 8, borderTopWidth: 1, borderColor: Colors.gray200, gap: 6 },
  cell: { flex: 1 }, input: { flex: 1, minHeight: 44, borderBottomWidth: 1, borderColor: Colors.gray300 },
  link: { color: Colors.action }, delete: { minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center' },
});
