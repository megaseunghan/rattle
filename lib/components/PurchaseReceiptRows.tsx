/* design-system: DESIGN.md — 매입 품목 행(확정 1안): 이름+금액 한 줄, 금액은 그 자리에서 고치고 칩은 눌러 펼친다. 왼쪽으로 밀어 뺀다. */
import { useState } from 'react';
import { useReceiptIngredientSearch } from '../hooks/useReceiptIngredientSearch';
import { Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import type { Ingredient } from '../../types';
import { AppIcon } from '../icons/AppIcon';
import { EditChip, FieldError, InlineAmount, MiniPanel, ui, won } from './purchase/PurchaseUi';
import { SwipeRemoveRow } from './purchase/SwipeRemoveRow';

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

/** 매입 단위 격자(4열). 재고 품목 등록 시트도 이 목록을 쓴다. */
export const PURCHASE_UNITS = ['개', '병', '봉', '박스', 'kg', 'g', 'L', '롤'] as const;
type Field = 'cat' | 'qty' | 'unit';

export function unitPriceLabel(amount: string, quantity: string): string {
  const q = Number(quantity);
  const a = Number(amount);
  if (!amount || !quantity || !(q > 0) || !Number.isFinite(a / q)) return '';
  return `단가 ${won(a / q)}원`;
}

export function PurchaseReceiptRows({ rows, change, remove, create, inventory, complete, storeId, focus, used, categories, defaultCategory, errors = {} }: {
  rows: ReceiptDraftRow[];
  categories: string[];
  defaultCategory: string;
  change: (id: string, patch: Partial<ReceiptDraftRow>) => void;
  remove: (row: ReceiptDraftRow) => void;
  create: (row: ReceiptDraftRow, name: string) => void;
  inventory: Ingredient[];
  complete: boolean;
  storeId: string;
  focus: (target: unknown) => void;
  used: (ingredientId: string, rowId: string) => boolean;
  errors?: Record<string, string>;
}) {
  const [limit, setLimit] = useState(5);
  const [activeId, setActiveId] = useState<string>();
  const [open, setOpen] = useState<{ id: string; field: Field } | null>(null);
  const active = rows.find(row => row.id === activeId);
  const term = (active?.ingredient?.name ?? active?.inputName ?? active?.name ?? '').trim();
  const { result, retry } = useReceiptIngredientSearch(storeId, term, inventory, complete);
  const toggle = (id: string, field: Field) => setOpen(current => current?.id === id && current.field === field ? null : { id, field });
  return <View>
    {!rows.length && <Text style={styles.empty}>품목을 추가해 주세요.</Text>}
    {rows.map((row, index) => {
      const label = (row.ingredient?.name ?? row.inputName ?? row.name) || `${index + 1}번째 품목`;
      const field = open?.id === row.id ? open.field : null;
      const category = row.category ?? defaultCategory;
      const unit = row.ingredient?.unit ?? row.unit ?? '';
      const quantityLabel = row.quantity ? `${row.quantity}${unit}` : '수량';
      return <SwipeRemoveRow key={row.id} id={row.id} label={label} onRemove={() => { setOpen(null); remove(row); }}>
        <View style={[styles.item, index > 0 && ui.rowLine]}>
        <View style={styles.line1}>
          <TextInput style={styles.name} accessibilityLabel={`${label} 항목명`} value={row.ingredient?.name ?? row.inputName ?? row.name}
            placeholder="품목 검색" placeholderTextColor={Colors.gray400} selectTextOnFocus maxLength={200}
            onFocus={event => { setLimit(5); setActiveId(row.id); setOpen(null); focus(event.currentTarget); }}
            onBlur={() => setActiveId(undefined)}
            onChangeText={inputName => { setLimit(5); setActiveId(row.id); change(row.id, { inputName, ingredient: undefined }); }} />
          <InlineAmount value={row.amount} label={`${label} 금액`} onFocus={target => { setOpen(null); focus(target); }}
            onChange={amount => change(row.id, { amount })} />
        </View>
        {row.id === activeId && !!term && <View style={styles.results}>
          {result?.failed ? <TouchableOpacity style={styles.option} onPress={retry}><Text style={styles.link}>검색하지 못했어요 · 다시 시도</Text></TouchableOpacity>
            : !result?.matches ? <Text style={styles.searching}>품목을 찾고 있어요…</Text>
            : result.matches.length === 0 ? <TouchableOpacity accessibilityRole="button" style={styles.option} onPress={() => {
              setActiveId(undefined); Keyboard.dismiss(); create(row, term);
            }}><Text style={styles.link}>+ '{term}' 새 품목으로 추가</Text></TouchableOpacity>
            : result.matches.slice(0, limit).map(item => {
              const already = used(item.id, row.id);
              return <TouchableOpacity accessibilityRole="button" disabled={already} key={item.id} style={styles.option}
                onPress={() => { change(row.id, { ingredient: item, inputName: item.name }); setActiveId(undefined); Keyboard.dismiss(); }}>
                <Text style={[styles.optionText, already && styles.optionUsed]}>{item.name} · {item.unit}{already ? ' · 이미 넣었어요' : ''}</Text>
              </TouchableOpacity>;
            })}
          {result?.matches && result.matches.length > limit && <TouchableOpacity accessibilityRole="button" style={styles.option}
            onPress={() => setLimit(count => count + 5)}><Text style={styles.link}>검색 결과 더 보기</Text></TouchableOpacity>}
        </View>}
        <View style={styles.line2}>
          <EditChip label={category} tinted open={field === 'cat'} accessibilityLabel={`${label} 카테고리 ${category}`} onPress={() => toggle(row.id, 'cat')} />
          <EditChip label={quantityLabel} open={field === 'qty' || field === 'unit'} accessibilityLabel={`${label} 수량 ${row.quantity ? quantityLabel : '입력 전'}`} onPress={() => toggle(row.id, 'qty')} />
          <Text style={styles.unitPrice}>{unitPriceLabel(row.amount, row.quantity)}</Text>
        </View>
        {field === 'cat' && <MiniPanel>
          {categories.map(name => <TouchableOpacity key={name} accessibilityRole="radio" accessibilityLabel={`${label} 카테고리 ${name}`}
            accessibilityState={{ checked: category === name }} style={[styles.opt, category === name && styles.optOn]}
            onPress={() => { change(row.id, { category: name }); setOpen(null); }}>
            <Text style={[styles.optText, category === name && styles.optTextOn]}>{name}</Text>
          </TouchableOpacity>)}
        </MiniPanel>}
        {(field === 'qty' || field === 'unit') && <MiniPanel>
          <TextInput style={[ui.input, styles.qty]} value={row.quantity} accessibilityLabel={`${label} 수량`} keyboardType="decimal-pad" autoFocus={field === 'qty'}
            placeholder="수량" placeholderTextColor={Colors.gray400} onFocus={event => focus(event.currentTarget)}
            onChangeText={quantity => change(row.id, { quantity: quantity.replace(/[^\d.]/g, '') })} />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={row.ingredient ? `${label} 단위 ${unit}, 재고 품목이라 고정` : `${label} 단위 ${unit || '없음'}`}
            accessibilityState={{ expanded: field === 'unit', disabled: !!row.ingredient }} disabled={!!row.ingredient}
            style={[styles.unitButton, field === 'unit' && styles.unitButtonOpen]} onPress={() => { Keyboard.dismiss(); toggle(row.id, field === 'unit' ? 'qty' : 'unit'); }}>
            <Text style={[styles.unitText, !unit && styles.pricePlaceholder]}>{unit || '단위'}</Text>
            {!row.ingredient && <AppIcon name="chevron-down" size={14} color={Colors.gray500} />}
          </TouchableOpacity>
          {field === 'unit' ? <UnitGrid value={unit} onPick={value => { change(row.id, { unit: value }); setOpen({ id: row.id, field: 'qty' }); }} />
            : <Text style={ui.hint}>{row.ingredient ? '재고 품목이라 단위는 재고와 같아요. ' : ''}수량을 바꿔도 금액은 그대로예요.</Text>}
        </MiniPanel>}
        <FieldError message={errors[row.id]} />
        </View>
      </SwipeRemoveRow>;
    })}
  </View>;
}

function UnitGrid({ value, onPick }: { value: string; onPick: (unit: string) => void }) {
  return <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="단위">
    {PURCHASE_UNITS.map(unit => <TouchableOpacity key={unit} accessibilityRole="radio" accessibilityState={{ checked: value === unit }}
      style={[styles.cell, value === unit && styles.optOn]} onPress={() => onPick(unit)}>
      <Text style={[styles.optText, value === unit && styles.optTextOn]}>{unit}</Text>
    </TouchableOpacity>)}
    <TouchableOpacity accessibilityRole="radio" accessibilityState={{ checked: !value }} style={[styles.cell, styles.cellWide, !value && styles.optOn]} onPress={() => onPick('')}>
      <Text style={[styles.optText, !value && styles.optTextOn]}>단위 없음</Text>
    </TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  empty: { fontFamily: Fonts.wantedRegular, fontSize: 14, color: Colors.gray500, paddingVertical: 12 },
  item: { paddingTop: 12, paddingBottom: 10 },
  line1: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flex: 1, minHeight: 44, paddingVertical: 0, fontFamily: Fonts.wantedSemiBold, fontSize: 15, color: Colors.black },
  pricePlaceholder: { fontFamily: Fonts.wantedMedium, color: Colors.gray400 },
  line2: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
  unitPrice: { fontFamily: Fonts.wantedMedium, fontSize: 12.5, color: Colors.gray400 },
  results: { marginTop: 4, paddingHorizontal: 8, borderRadius: 12, backgroundColor: Colors.fieldTint },
  option: { minHeight: 44, justifyContent: 'center' },
  optionText: { fontFamily: Fonts.wantedMedium, fontSize: 15, color: Colors.black },
  optionUsed: { color: Colors.gray400 },
  searching: { fontFamily: Fonts.wantedRegular, fontSize: 13, color: Colors.gray500, paddingVertical: 12 },
  link: { fontFamily: Fonts.wantedSemiBold, fontSize: 14, color: Colors.action },
  opt: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 10, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.homeBorder },
  optOn: { borderColor: Colors.primary, backgroundColor: Colors.tinted },
  optText: { fontFamily: Fonts.wantedSemiBold, fontSize: 14, color: Colors.gray600 },
  optTextOn: { color: Colors.action },
  qty: { width: 88 },
  unitButton: { minHeight: 44, minWidth: 72, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.homeBorder, backgroundColor: Colors.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  unitButtonOpen: { borderColor: Colors.primary },
  unitText: { fontFamily: Fonts.wantedSemiBold, fontSize: 15, color: Colors.black },
  grid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { width: '23.5%', minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.homeBorder },
  cellWide: { width: '100%' },
});
