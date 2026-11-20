import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/colors';
import type { Ingredient } from '../../types';

export interface ReceiptDraftRow {
  id: string;
  name: string;
  amount: string;
  quantity: string;
  unit_price: string;
  ingredient?: Ingredient;
  removed?: boolean;
}

export function PurchaseReceiptRows({ rows, change, select }: {
  rows: ReceiptDraftRow[];
  change: (id: string, patch: Partial<ReceiptDraftRow>) => void;
  select: (row: ReceiptDraftRow) => void;
}) {
  return <View style={styles.table}>
    {rows.length > 0 && <Text>사진에서 읽은 내용이에요. 맞는지 확인해 주세요.</Text>}
    <View style={styles.line}><Text style={styles.cell}>항목</Text><Text style={styles.cell}>금액 (원)</Text></View>
    {!rows.length && <Text>품목을 직접 입력해 주세요.</Text>}
    {rows.map(row => <View key={row.id} style={styles.row}>
      <View style={styles.line}>
        <TouchableOpacity style={styles.cell} accessibilityRole="button" accessibilityLabel={row.name + ' 재고 품목 선택'} onPress={() => select(row)}>
          <Text>{row.ingredient?.name ?? row.name}</Text><Text style={styles.link}>{row.ingredient ? '품목 변경' : '재고 품목 선택'}</Text>
        </TouchableOpacity>
        <TextInput style={styles.input} value={row.amount} accessibilityLabel={row.name + ' 금액'} keyboardType="number-pad"
          placeholder="금액" onChangeText={amount => change(row.id, { amount })} />
      </View>
      <View style={styles.line}>
        <View style={styles.cell}><Text>수량{row.ingredient && ' (' + row.ingredient.unit + ')'}</Text>
          <TextInput style={styles.input} value={row.quantity} accessibilityLabel={row.name + ' 수량'} keyboardType="decimal-pad"
            placeholder="수량 확인" onChangeText={quantity => change(row.id, { quantity })} /></View>
        <View style={styles.cell}><Text>단가 (원)</Text>
          <TextInput style={styles.input} value={row.unit_price} accessibilityLabel={row.name + ' 단가'} keyboardType="decimal-pad"
            placeholder="단가 확인" onChangeText={unit_price => change(row.id, { unit_price })} /></View>
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={row.name + ' 행 삭제'} onPress={() => change(row.id, { removed: true })} style={styles.delete}><Text>삭제</Text></TouchableOpacity>
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  table: { gap: 8 }, line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: { paddingVertical: 8, borderTopWidth: 1, borderColor: Colors.gray200, gap: 6 },
  cell: { flex: 1 }, input: { flex: 1, minHeight: 44, borderBottomWidth: 1, borderColor: Colors.gray300 },
  link: { color: Colors.action }, delete: { minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center' },
});
