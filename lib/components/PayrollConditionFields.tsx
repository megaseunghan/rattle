import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/colors';
import { Field } from './ui';
import type { PayrollFieldsForm } from '../utils/employeePayrollFields';
import type { IncomeType } from '../../types';
import { probationEndFor } from '../utils/employeePayrollFields';

interface Props {
  value: PayrollFieldsForm;
  onChange: (next: PayrollFieldsForm) => void;
  isPart: boolean;
  joinedAt: string;
}

function Choice<T>({ options, selected, onSelect, label }: { options: { value: T; label: string }[]; selected: T; onSelect: (value: T) => void; label: string }) {
  return (
    <View style={styles.choiceRow} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map(option => {
        const active = option.value === selected;
        return (
          <TouchableOpacity key={option.label} onPress={() => onSelect(option.value)} style={[styles.chip, active && styles.chipActive]}
            accessibilityRole="radio" accessibilityState={{ selected: active }}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** 급여 계산 2026-v2 최소 입력: 소득 구분·주 근무시간(분)·주휴 포함 여부·수습. 화면 새 디자인은 A 트랙에서 한다. */
export function PayrollConditionFields({ value, onChange, isPart, joinedAt }: Props) {
  const set = (patch: Partial<PayrollFieldsForm>) => onChange({ ...value, ...patch });
  return (
    <View style={styles.group}>
      <Text style={styles.label}>소득 구분</Text>
      <Choice<IncomeType> label="소득 구분" selected={value.income_type} onSelect={income_type => set({ income_type })}
        options={[{ value: 'employee', label: '근로자' }, { value: 'freelancer', label: '프리랜서 3.3%' }]} />
      <Text style={styles.hint}>3.3%는 프리랜서로 정한 경우에만 떼요. 근무시간으로 정하지 않아요.</Text>

      {isPart && <>
        <Text style={styles.label}>주 근무시간</Text>
        <View style={styles.timeRow}>
          <View style={styles.timeField}><Field label="시간" value={value.weekly_hours} onChangeText={weekly_hours => set({ weekly_hours })} placeholder="15" keyboardType="number-pad" /></View>
          <View style={styles.timeField}><Field label="분(10분 단위)" value={value.weekly_mins} onChangeText={weekly_mins => set({ weekly_mins })} placeholder="0" keyboardType="number-pad" /></View>
        </View>
        <Text style={styles.hint}>비워 두면 공제를 계산하지 않아요. 주 15시간 이상이면 4대보험 대상이에요.</Text>
        <Text style={styles.label}>주휴수당</Text>
        <Choice<boolean | null> label="주휴수당" selected={value.weekly_rest_included} onSelect={weekly_rest_included => set({ weekly_rest_included })}
          options={[{ value: false, label: '따로 줘요' }, { value: true, label: '시급에 포함' }, { value: null, label: '아직 안 정했어요' }]} />
      </>}

      <View style={styles.switchRow}>
        <Text style={styles.label}>수습 적용(90%)</Text>
        <Switch value={value.is_probation} onValueChange={is_probation => set({ is_probation })} accessibilityLabel="수습 적용" />
      </View>
      {value.is_probation && <>
        <Field label="수습 마지막 날 (YYYY-MM-DD)" value={value.probation_ends_on} onChangeText={probation_ends_on => set({ probation_ends_on })} placeholder="2026-12-31" />
        <View style={styles.choiceRow}>
          {([1, 2, 3] as const).map(months => (
            <TouchableOpacity key={months} style={styles.chip} accessibilityRole="button" accessibilityLabel={`입사일부터 ${months}개월`}
              onPress={() => { const end = probationEndFor(joinedAt.trim(), months); if (end) set({ probation_ends_on: end }); }}>
              <Text style={styles.chipText}>{months}개월</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.hint}>입사일부터 이 날까지 급여를 90%로 계산해요. 3개월을 넘길 수 없어요.</Text>
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.black },
  hint: { fontSize: 13, color: Colors.gray500, lineHeight: 19 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: Colors.homeBorder, backgroundColor: Colors.white },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.gray500 },
  chipTextActive: { color: Colors.white, fontWeight: '500' },
  timeRow: { flexDirection: 'row', gap: 10 },
  timeField: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
});
