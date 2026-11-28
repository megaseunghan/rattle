import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../../icons/AppIcon';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { STORE_LAST_DAY } from '../../../types';
import { MAX_PICKABLE_DAY } from '../../utils/payday';
import { UNSET_LABEL, type FillOption } from './storeFillCopy';

export interface FillRowProps {
  label: string;
  value: string | null;
  optional?: boolean;
  readOnly?: boolean;
  onPress?: () => void;
}

/** 한 줄 + 누르면 아래 시트. 안 정한 값은 회색 '아직 안 정했어요'. 점장은 누를 수 없다. */
export function FillRow({ label, value, optional, readOnly, onPress }: FillRowProps) {
  const shown = value ?? UNSET_LABEL;
  return (
    <Pressable disabled={readOnly} onPress={onPress} accessibilityRole={readOnly ? 'text' : 'button'}
      accessibilityLabel={`${label}${optional ? ', 선택' : ''}, ${shown}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Text style={styles.rowLabel}>{label}</Text>
      {optional ? <Text style={styles.optional}>선택</Text> : null}
      <View style={styles.rowValueWrap}>
        <Text style={[styles.rowValue, value == null && styles.rowUnset]} numberOfLines={2}>{shown}</Text>
        {readOnly ? null : <AppIcon name="chevron-forward" size={16} color={value == null ? Colors.gray400 : Colors.gray500} />}
      </View>
    </Pressable>
  );
}

export interface ChoiceListProps<T> {
  options: FillOption<T>[];
  selected: T | null | undefined;
  onSelect: (value: T) => void;
  disabled?: boolean;
}

/** 큰 보기 목록. 고른 항목은 연파랑 바탕(라디오 원 없음). */
export function ChoiceList<T>({ options, selected, onSelect, disabled }: ChoiceListProps<T>) {
  return (
    <View style={styles.choices} accessibilityRole="radiogroup">
      {options.map(option => {
        const checked = option.value === selected;
        return (
          <Pressable key={String(option.value)} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked, disabled }}
            onPress={() => onSelect(option.value)} style={({ pressed }) => [styles.choice, checked && styles.choiceOn, pressed && !checked && styles.rowPressed]}>
            <Text style={[styles.choiceTitle, checked && styles.choiceTitleOn]}>{option.title}</Text>
            {option.description ? <Text style={styles.choiceDesc}>{option.description}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export interface SegmentProps<T> {
  options: FillOption<T>[];
  selected: T | null | undefined;
  onSelect: (value: T) => void;
  isDisabled?: (value: T) => boolean;
}

/** 나란한 버튼 고르기(seg3). */
export function Segment<T>({ options, selected, onSelect, isDisabled }: SegmentProps<T>) {
  return (
    <View style={styles.seg} accessibilityRole="radiogroup">
      {options.map(option => {
        const checked = option.value === selected;
        const off = isDisabled?.(option.value) ?? false;
        return (
          <Pressable key={String(option.value)} disabled={off} accessibilityRole="radio" accessibilityState={{ checked, disabled: off }}
            onPress={() => onSelect(option.value)} style={[styles.segButton, checked && styles.choiceOn, off && styles.segOff]}>
            <Text style={[styles.segText, checked && styles.choiceTitleOn, off && styles.segTextOff]}>{option.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const GRID_DAYS = [...Array.from({ length: 31 }, (_, i) => i + 1), STORE_LAST_DAY];

export interface DayGridProps {
  selected: number | null;
  onSelect: (day: number) => void;
  isDisabled?: (day: number) => boolean;
}

/** 날짜 판: 1~29일·말일. 30·31일은 없는 달이 있어 취소선으로 막는다. */
export function DayGrid({ selected, onSelect, isDisabled }: DayGridProps) {
  return (
    <View style={styles.grid}>
      {GRID_DAYS.map(day => {
        const impossible = day > MAX_PICKABLE_DAY;
        const off = impossible || (isDisabled?.(day) ?? false);
        const checked = day === selected && !off;
        const last = day === STORE_LAST_DAY;
        const label = last ? '말일' : String(day);
        const a11y = impossible ? `${day}일, 없는 달이 있어 고를 수 없어요` : last ? '말일' : `${day}일`;
        return (
          <View key={day} style={styles.cell}>
            <Pressable disabled={off} onPress={() => onSelect(day)} accessibilityRole="button" accessibilityLabel={a11y}
              accessibilityState={{ selected: checked, disabled: off }}
              style={({ pressed }) => [styles.day, checked && styles.daySelected, pressed && !checked && styles.rowPressed]}>
              <Text style={[last ? styles.dayLast : styles.dayNum, checked && styles.dayTextSelected,
                off && styles.dayOff, impossible && styles.dayStrike]}>{label}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

export function SheetNote({ children }: { children: string }) {
  return <Text style={styles.note}>{children}</Text>;
}

export function SheetLabel({ children }: { children: string }) {
  return <Text style={styles.sheetLabel}>{children}</Text>;
}

export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.ok, disabled && styles.okOff, pressed && !disabled && styles.okPressed]}>
      <Text style={[styles.okText, disabled && styles.okTextOff]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 60, borderBottomWidth: 1, borderBottomColor: Colors.gray100, paddingHorizontal: 2, gap: 6 },
  rowPressed: { backgroundColor: Colors.gray50 },
  rowLabel: { fontFamily: Fonts.wantedMedium, fontSize: 15, color: Colors.gray600, flexShrink: 0 },
  optional: { fontFamily: Fonts.wantedSemiBold, fontSize: 12, color: Colors.gray500, backgroundColor: Colors.gray100, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  rowValueWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingVertical: 10 },
  rowValue: { fontFamily: Fonts.wantedBold, fontSize: 16, color: Colors.black, textAlign: 'right', flexShrink: 1 },
  rowUnset: { fontFamily: Fonts.wantedMedium, color: Colors.gray400 },
  choices: { marginTop: 12, gap: 4 },
  choice: { minHeight: 60, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, marginHorizontal: -14, justifyContent: 'center' },
  choiceOn: { backgroundColor: Colors.bg },
  choiceTitle: { fontFamily: Fonts.wantedBold, fontSize: 16, color: Colors.black },
  choiceTitleOn: { color: Colors.action },
  choiceDesc: { fontFamily: Fonts.wantedRegular, fontSize: 13, lineHeight: 19, color: Colors.gray500, marginTop: 4 },
  seg: { flexDirection: 'row', gap: 6, marginTop: 8 },
  segButton: { flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: Colors.gray50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segOff: { opacity: 0.5 },
  segText: { fontFamily: Fonts.wantedSemiBold, fontSize: 15, color: Colors.gray600 },
  segTextOff: { color: Colors.gray400 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, marginHorizontal: -2 },
  cell: { width: `${100 / 7}%`, padding: 2 },
  day: { height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: Colors.action },
  dayNum: { fontFamily: Fonts.geistMedium, fontSize: 15, color: Colors.black, fontVariant: ['tabular-nums'] },
  dayLast: { fontFamily: Fonts.wantedSemiBold, fontSize: 14, color: Colors.black },
  dayTextSelected: { color: Colors.white },
  dayOff: { color: Colors.gray300 },
  dayStrike: { textDecorationLine: 'line-through' },
  note: { fontFamily: Fonts.wantedRegular, fontSize: 12, lineHeight: 19, color: Colors.gray500, marginTop: 12 },
  sheetLabel: { fontFamily: Fonts.wantedSemiBold, fontSize: 13, color: Colors.gray600, marginTop: 18 },
  ok: { marginTop: 20, minHeight: 52, borderRadius: 14, backgroundColor: Colors.action, alignItems: 'center', justifyContent: 'center' },
  okOff: { backgroundColor: Colors.gray100 },
  okPressed: { opacity: 0.85 },
  okText: { fontFamily: Fonts.wantedBold, fontSize: 16, color: Colors.white },
  okTextOff: { color: Colors.gray400 },
});
