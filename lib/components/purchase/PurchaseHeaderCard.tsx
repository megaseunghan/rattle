/* design-system: DESIGN.md — 매입 등록 맨 위 카드: 매입일(네이티브 휠) · 거래처(검색 드롭다운) */
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { AppIcon } from '../../icons/AppIcon';
import { getPurchaseSuppliers } from '../../services/purchases';
import { FieldError, PurchaseCard } from './PurchaseUi';

const SUPPLIER_LIMIT = 8;
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const dateLabel = (date: Date): string => `${date.getMonth() + 1}월 ${date.getDate()}일 (${DAYS[date.getDay()]})`;

type Open = 'date' | 'supplier' | null;

export function PurchaseHeaderCard({ date, onDateChange, supplier, onSupplierChange, storeId, supplierError, disabled = false }: {
  date: Date; onDateChange: (date: Date) => void; supplier: string; onSupplierChange: (name: string) => void;
  storeId: string | undefined; supplierError?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState<Open>(null);
  useEffect(() => { if (disabled) setOpen(null); }, [disabled]);
  const toggle = (next: Exclude<Open, null>) => setOpen(current => current === next ? null : next);
  return <PurchaseCard label="매입일과 거래처">
    <HeaderRow label="매입일" value={dateLabel(date)} open={open === 'date'} disabled={disabled} onPress={() => toggle('date')} />
    {open === 'date' && <DateWheel date={date} onChange={onDateChange} onDone={() => setOpen(null)} />}
    <HeaderRow label="거래처" value={supplier || '골라 주세요'} placeholder={!supplier} open={open === 'supplier'} disabled={disabled}
      onPress={() => toggle('supplier')} invalid={!!supplierError} />
    {open !== 'supplier' && <FieldError message={supplierError} />}
    {open === 'supplier' && storeId && <SupplierDropdown storeId={storeId} selected={supplier}
      onSelect={name => { onSupplierChange(name); setOpen(null); }} />}
  </PurchaseCard>;
}

function HeaderRow({ label, value, open, onPress, disabled, placeholder = false, invalid = false }: {
  label: string; value: string; open: boolean; onPress: () => void; disabled: boolean; placeholder?: boolean; invalid?: boolean;
}) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label} ${value}`} accessibilityState={{ expanded: open, disabled }}
    disabled={disabled} onPress={onPress} style={[styles.row, label !== '매입일' && styles.rowLine]}>
    <Text style={styles.key}>{label}</Text>
    <Text numberOfLines={1} style={[styles.value, placeholder && styles.placeholder, invalid && styles.invalid]}>{value}</Text>
    <AppIcon name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={Colors.gray400} />
  </TouchableOpacity>;
}

function DateWheel({ date, onChange, onDone }: { date: Date; onChange: (date: Date) => void; onDone: () => void }) {
  if (Platform.OS !== 'ios') {
    // Android는 시스템 날짜 대화상자를 띄우고 고르면 닫는다.
    return <DateTimePicker value={date} mode="date" display="default" onChange={(event, next) => { onDone(); if (event.type === 'set' && next) onChange(next); }} />;
  }
  return <View style={styles.wheel}>
    <DateTimePicker testID="purchase-date-wheel" value={date} mode="date" display="spinner" locale="ko-KR" themeVariant="light"
      onChange={(_, next) => { if (next) onChange(next); }} />
    <View style={styles.wheelFoot}>
      <TouchableOpacity accessibilityRole="button" style={styles.footButton} onPress={() => onChange(new Date())}><Text style={styles.today}>오늘로</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={[styles.footButton, styles.done]} onPress={onDone}><Text style={styles.doneText}>완료</Text></TouchableOpacity>
    </View>
  </View>;
}

function SupplierDropdown({ storeId, selected, onSelect }: { storeId: string; selected: string; onSelect: (name: string) => void }) {
  const [query, setQuery] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    getPurchaseSuppliers(storeId, controller.signal)
      .then(list => { if (!controller.signal.aborted) { setNames(list); setState('ready'); } })
      .catch(() => { if (!controller.signal.aborted) setState('failed'); });
    return () => controller.abort();
  }, [storeId, attempt]);
  const term = query.trim();
  const matches = names.filter(name => name.includes(term));
  const canAdd = !!term && !names.includes(term) && term.length <= 100;
  return <View style={styles.dropdown}>
    <TextInput style={styles.search} value={query} onChangeText={setQuery} placeholder="거래처 검색" placeholderTextColor={Colors.gray400}
      accessibilityLabel="거래처 검색" autoFocus returnKeyType="done" maxLength={100} onSubmitEditing={() => { if (canAdd) onSelect(term); else if (matches.length === 1) onSelect(matches[0]); }} />
    {state === 'loading' && <Text style={styles.empty}>거래처를 불러오고 있어요.</Text>}
    {state === 'failed' && <View style={styles.failedRow}>
      <Text style={styles.empty}>거래처 목록을 불러오지 못했어요.</Text>
      <TouchableOpacity accessibilityRole="button" style={styles.option} onPress={() => setAttempt(n => n + 1)}><Text style={styles.addText}>다시 불러오기</Text></TouchableOpacity>
    </View>}
    {state === 'ready' && !names.length && !term && <Text style={styles.empty}>등록된 거래처가 없어요.</Text>}
    {matches.slice(0, SUPPLIER_LIMIT).map(name => <TouchableOpacity key={name} accessibilityRole="button" accessibilityState={{ selected: name === selected }}
      style={styles.option} onPress={() => onSelect(name)}>
      <Text numberOfLines={1} style={[styles.optionText, name === selected && styles.optionOn]}>{name}</Text>
      {name === selected && <AppIcon name="check" size={18} color={Colors.action} />}
    </TouchableOpacity>)}
    {matches.length > SUPPLIER_LIMIT && <Text style={styles.empty}>검색어를 더 입력해 주세요.</Text>}
    {canAdd && <TouchableOpacity accessibilityRole="button" style={[styles.option, styles.addOption]} onPress={() => onSelect(term)}>
      <Text numberOfLines={1} style={styles.addText}>+ '{term}' 새 거래처로 추가</Text>
    </TouchableOpacity>}
  </View>;
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowLine: { borderTopWidth: 1, borderTopColor: Colors.hairline },
  key: { width: 64, fontFamily: Fonts.wantedMedium, fontSize: 14, color: Colors.gray600 },
  value: { flex: 1, fontFamily: Fonts.wantedSemiBold, fontSize: 15, color: Colors.black },
  placeholder: { fontFamily: Fonts.wantedMedium, color: Colors.gray400 },
  invalid: { color: Colors.negative },
  wheel: { paddingBottom: 8 },
  wheelFoot: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  footButton: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 12 },
  today: { fontFamily: Fonts.wantedSemiBold, fontSize: 14, color: Colors.gray600 },
  done: { backgroundColor: Colors.tinted },
  doneText: { fontFamily: Fonts.wantedBold, fontSize: 14, color: Colors.action },
  dropdown: { marginBottom: 10, padding: 8, borderRadius: 12, backgroundColor: Colors.fieldTint, gap: 2 },
  search: { minHeight: 44, borderWidth: 1, borderColor: Colors.homeBorder, borderRadius: 10, paddingHorizontal: 12, backgroundColor: Colors.white, fontFamily: Fonts.wantedMedium, fontSize: 15, color: Colors.black, marginBottom: 4 },
  option: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, borderRadius: 8 },
  optionText: { flex: 1, fontFamily: Fonts.wantedMedium, fontSize: 15, color: Colors.black },
  optionOn: { fontFamily: Fonts.wantedBold, color: Colors.action },
  addOption: { backgroundColor: Colors.tinted },
  addText: { fontFamily: Fonts.wantedSemiBold, fontSize: 14, color: Colors.action },
  empty: { fontFamily: Fonts.wantedRegular, fontSize: 13, color: Colors.gray500, paddingHorizontal: 8, paddingVertical: 10 },
  failedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
