/* design-system: DESIGN.md 「직원 정보 수정(S05)」 — 시급·월급 바꾸기 시트, 부양가족 −/+ 시트. */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { Radius, Type } from '../../../constants/designTokens';
import { AppIcon } from '../../icons/AppIcon';
import { koreanDate } from '../../utils/regularWages';
import { FieldSheet } from '../join/FieldSheet';
import { formatMoneyInput, UnderlineInput } from '../join/UnderlineInput';
import { amountOf } from '../join/approvalValues';
import { formatKoreanDate } from '../pickers';
import { wageChangeDate, type WageChangeFrom } from './wageChange';
import { clampDependents, DEPENDENTS_MAX, DEPENDENTS_MIN } from './employeeInfoValues';

interface BaseSheet { visible: boolean; onClose: () => void; busy?: boolean }

export interface WageChangeValue { amount: number; effectiveDate: string }

/** 시급·월급 바꾸기: 새 금액 + 오늘부터 / 다음 급여 기간부터. */
export function WageChangeSheet({ visible, onClose, busy, isPart, current, closeDay, joinedAt, onConfirm }: BaseSheet & {
  isPart: boolean; current: number; closeDay: number | null | undefined; joinedAt: string | null;
  onConfirm: (value: WageChangeValue) => void;
}) {
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState<WageChangeFrom>('today');
  useEffect(() => { if (visible) { setAmount(formatMoneyInput(String(current || ''))); setFrom('today'); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = koreanDate();
  const dates = { today: wageChangeDate('today', today, closeDay, joinedAt), next: wageChangeDate('next', today, closeDay, joinedAt) };
  const value = amountOf(amount);
  const label = isPart ? '시급' : '월 기본급';
  const error = !value ? `${label}을 입력해 주세요.` : value === current ? '지금과 같은 금액이에요.' : null;
  return <FieldSheet visible={visible} onClose={onClose} busy={busy} title={`${label} 바꾸기`}
    subtitle={`지금 ${current.toLocaleString('ko-KR')}원이에요. 바꾼 날 전 급여는 그대로 둬요.`}
    confirmLabel="바꾸기" confirmDisabled={!!error} onConfirm={() => { if (value && !error) onConfirm({ amount: value, effectiveDate: dates[from] }); }}>
    <UnderlineInput label={`새 ${label}`} value={amount} unit="원" numeric keyboardType="number-pad" maxLength={13} editable={!busy}
      onChangeText={text => setAmount(formatMoneyInput(text))} />
    {!!amount && !!error && <Text style={styles.error}>{error}</Text>}
    <Text style={styles.caption}>언제부터 바꿀까요?</Text>
    <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel="적용일">
      {(['today', 'next'] as const).map(option => {
        const active = option === from;
        const title = option === 'today' ? '오늘부터' : '다음 급여 기간부터';
        return <Pressable key={option} accessibilityRole="radio" accessibilityLabel={title} accessibilityState={{ checked: active, disabled: busy }} disabled={busy}
          onPress={() => setFrom(option)} style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && styles.pressed]}>
          <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>{title}</Text>
          <Text style={styles.optionDate}>{formatKoreanDate(dates[option])}부터</Text>
        </Pressable>;
      })}
    </View>
  </FieldSheet>;
}

/** 부양가족(본인 포함) −/+ */
export function DependentsSheet({ visible, onClose, busy, value, onConfirm }: BaseSheet & { value: number; onConfirm: (value: number) => void }) {
  const [count, setCount] = useState(clampDependents(value));
  useEffect(() => { if (visible) setCount(clampDependents(value)); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = (delta: number) => setCount(current => clampDependents(current + delta));
  return <FieldSheet visible={visible} onClose={onClose} busy={busy} title="부양가족" subtitle="본인을 포함한 수예요. 소득세 계산에 써요."
    onConfirm={() => onConfirm(count)}>
    <View style={styles.stepper} accessible accessibilityRole="adjustable" accessibilityLabel="부양가족 수" accessibilityValue={{ min: DEPENDENTS_MIN, max: DEPENDENTS_MAX, now: count, text: `${count}명` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={event => step(event.nativeEvent.actionName === 'increment' ? 1 : -1)}>
      <StepButton label="한 명 줄이기" icon="remove" disabled={busy || count <= DEPENDENTS_MIN} onPress={() => step(-1)} />
      <Text style={styles.count}>{count}<Text style={styles.countUnit}>명</Text></Text>
      <StepButton label="한 명 늘리기" icon="add" disabled={busy || count >= DEPENDENTS_MAX} onPress={() => step(1)} />
    </View>
  </FieldSheet>;
}

function StepButton({ label, icon, disabled, onPress }: { label: string; icon: 'add' | 'remove'; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.stepButton, disabled && styles.off, pressed && styles.pressed]}>
    <AppIcon name={icon} size={24} color={Colors.gray700} />
  </Pressable>;
}

const styles = StyleSheet.create({
  error: { marginTop: 8, fontFamily: Fonts.wantedRegular, fontSize: Type.sm, color: Colors.gray600 },
  caption: { marginTop: 24, marginBottom: 10, fontFamily: Fonts.wantedMedium, fontSize: Type.sm, color: Colors.gray600 },
  options: { gap: 8 },
  option: { minHeight: 64, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12, borderRadius: Radius.lg, backgroundColor: Colors.chipBg },
  optionActive: { backgroundColor: Colors.bg },
  optionTitle: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.md, color: Colors.black },
  optionTitleActive: { color: Colors.action },
  optionDate: { marginTop: 4, fontFamily: Fonts.wantedRegular, fontSize: Type.sm, color: Colors.gray600 },
  pressed: { opacity: 0.7 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, paddingVertical: 12 },
  stepButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.chipBg, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.35 },
  count: { minWidth: 72, textAlign: 'center', fontFamily: Fonts.geistSemiBold, fontSize: 32, color: Colors.black, fontVariant: ['tabular-nums'] },
  countUnit: { fontFamily: Fonts.wantedMedium, fontSize: Type.lg, color: Colors.gray600 },
});
