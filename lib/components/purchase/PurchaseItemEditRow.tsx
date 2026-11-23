/* design-system: DESIGN.md — 매입 상세에서 바로 고치는 품목 행(확정 시안 purchase-edit-v2): 금액은 그 자리에서, 수량은 칩을 눌러 고친다 */
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import type { PurchaseItem } from '../../../types';
import { unitPriceLabel } from '../PurchaseReceiptRows';
import { EditChip, FieldError, InlineAmount, MiniPanel, PlainChip, ui, won } from './PurchaseUi';

export type ItemDraft = { quantity: string; amount: string };
export const itemBase = (item: PurchaseItem): ItemDraft => ({ quantity: String(item.quantity), amount: String(Math.round(item.subtotal)) });

export function PurchaseItemEditRow({ item, draft, open, onToggle, onChange, first, error, latestAmount, disabled, onFocus }: {
  item: PurchaseItem; draft: ItemDraft; open: boolean; onToggle: () => void;
  onChange: (draft: ItemDraft) => void; first: boolean; error?: string; latestAmount?: number; disabled: boolean;
  onFocus: (target: unknown) => void;
}) {
  const base = itemBase(item);
  const edited = draft.quantity !== base.quantity || draft.amount !== base.amount;
  const quantityLabel = draft.quantity ? `${draft.quantity}${item.unit ?? ''}` : '수량';
  return <View style={[styles.item, !first && ui.rowLine]}>
    <View style={styles.line1}>
      <Text numberOfLines={2} style={styles.name}>{item.name}</Text>
      {edited && <View accessibilityLabel="고침" style={styles.dot} />}
      <View style={styles.amountSlot}>
        <InlineAmount value={draft.amount} label={`${item.name} 금액`} editable={!disabled} onFocus={onFocus}
          onChange={amount => onChange({ ...draft, amount })} />
      </View>
    </View>
    <View style={styles.line2}>
      {!!item.category && <PlainChip label={item.category} />}
      <EditChip label={quantityLabel} open={open} disabled={disabled} accessibilityLabel={`${item.name} 수량 ${quantityLabel}`} onPress={onToggle} />
      <Text style={styles.unitPrice}>{unitPriceLabel(draft.amount, draft.quantity)}{item.ingredient_id ? ' · 재고 반영' : ''}</Text>
    </View>
    {open && <MiniPanel>
      <TextInput style={[ui.input, styles.qty]} value={draft.quantity} accessibilityLabel={`${item.name} 수량`} keyboardType="decimal-pad" autoFocus
        placeholder="수량" placeholderTextColor={Colors.gray400} editable={!disabled} onFocus={event => onFocus(event.currentTarget)}
        onChangeText={quantity => onChange({ ...draft, quantity: quantity.replace(/[^\d.]/g, '') })} />
      {!!item.unit && <Text style={styles.unit}>{item.unit}</Text>}
      <Text style={ui.hint}>수량을 바꿔도 금액은 그대로예요.</Text>
    </MiniPanel>}
    <FieldError message={error} />
    {latestAmount != null && <LatestAmount amount={latestAmount} />}
  </View>;
}

/** 다른 곳에서 먼저 고친 뒤: 고친 값은 두고 지금 저장된 금액을 파란 글씨로 보여준다. */
export function LatestAmount({ amount }: { amount: number }) {
  return <Text accessibilityLiveRegion="polite" style={styles.latest}>지금 저장된 금액 <Text style={styles.latestValue}>{won(amount)}</Text>원</Text>;
}

const styles = StyleSheet.create({
  item: { paddingTop: 12, paddingBottom: 10 },
  line1: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, fontFamily: Fonts.wantedSemiBold, fontSize: 15, color: Colors.black },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  amountSlot: { marginLeft: 'auto' },
  line2: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 },
  unitPrice: { fontFamily: Fonts.wantedMedium, fontSize: 12.5, color: Colors.gray400 },
  qty: { width: 96 },
  unit: { fontFamily: Fonts.wantedSemiBold, fontSize: 15, color: Colors.gray600 },
  latest: { marginTop: 6, fontFamily: Fonts.wantedSemiBold, fontSize: 13, color: Colors.action },
  latestValue: { fontFamily: Fonts.geistSemiBold },
});
