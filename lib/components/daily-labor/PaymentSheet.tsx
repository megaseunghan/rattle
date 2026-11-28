/* design-system: DESIGN.md — S54 'n건 지급 완료로 바꾸기' 시트. 앱은 송금하지 않고 지급일·지급 방법·공제만 기록한다. */
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Radius, Type } from '../../../constants/designTokens';
import { Button } from '../ui/Button';
import { NumericText } from '../ui/NumericText';
import { DeductionBlock } from './DeductionBlock';
import { LaborSheet } from './LaborSheet';
import { PayDateCalendar } from './PayDateCalendar';
import { dayLabel, won } from './format';
import { GrayNote, SectionLabel, Segment } from './parts';
import {
  draftErrors, hasEdits, resetDeduction, resolvePaidOn, setDeduction, totalNet, type PayDayChoice, type PaymentDraftGroup,
} from './paymentDraft';
import type { DailyLaborPaymentMethod } from '../../../types';

export interface PaymentSubmit { paidOn: string; method: DailyLaborPaymentMethod; groups: PaymentDraftGroup[] }

interface PaymentSheetProps {
  visible: boolean;
  initialGroups: PaymentDraftGroup[];
  nameOf: (laborerId: string) => string;
  today: string;
  saving: boolean;
  onClose: () => void;
  onSubmit: (submit: PaymentSubmit) => void;
}

const METHOD_OPTIONS: { value: DailyLaborPaymentMethod; label: string }[] = [{ value: 'transfer', label: '계좌이체' }, { value: 'cash', label: '현금' }];

function ctaLabel(paidOn: string | null, method: DailyLaborPaymentMethod | null, hasError: boolean): string {
  if (!paidOn) return '지급일을 골라 주세요';
  if (!method) return '지급 방법을 골라 주세요';
  if (hasError) return '공제 금액을 확인해 주세요';
  return '지급 완료로 바꾸기';
}

/** 부모가 key로 다시 만들어 열 때마다 새 입력으로 시작한다. */
export function PaymentSheet({ visible, initialGroups, nameOf, today, saving, onClose, onSubmit }: PaymentSheetProps) {
  const [groups, setGroups] = useState(initialGroups);
  const [choice, setChoice] = useState<PayDayChoice>('today');
  const [picked, setPicked] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [method, setMethod] = useState<DailyLaborPaymentMethod | null>(null);
  const errors = useMemo(() => draftErrors(groups), [groups]);
  const paidOn = resolvePaidOn(choice, picked, today);
  const hasError = Object.keys(errors).length > 0;
  const ready = !!paidOn && !!method && !hasError;
  const dirty = !!method || choice !== 'today' || hasEdits(groups);
  const count = groups.reduce((sum, g) => sum + g.entries.length, 0);

  function close() {
    if (saving) return;
    if (!dirty) { onClose(); return; }
    Alert.alert('입력한 내용을 버릴까요?', '지급 완료로 바꾸지 않고 닫아요.', [
      { text: '계속 입력', style: 'cancel' },
      { text: '버리기', style: 'destructive', onPress: onClose },
    ]);
  }

  function chooseDay(next: PayDayChoice) {
    setChoice(next);
    setCalendarOpen(next === 'pick');
  }

  const dayOptions: { value: PayDayChoice; label: string }[] = [
    { value: 'today', label: `오늘(${dayLabel(today).replace(/\(.\)$/, '')})` },
    { value: 'yesterday', label: '어제' },
    { value: 'pick', label: choice === 'pick' && picked ? dayLabel(picked) : '다른 날' },
  ];

  return (
    <LaborSheet visible={visible} onClose={close} title={`${count}건 지급 완료로 바꾸기`}
      footer={<Button label={ctaLabel(paidOn, method, hasError)} disabled={!ready} loading={saving}
        onPress={() => paidOn && method && onSubmit({ paidOn, method, groups })} />}>
      <SectionLabel text="지급일" />
      <View style={styles.chips}>
        {dayOptions.map(option => {
          const selected = option.value === choice;
          return (
            <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => chooseDay(option.value)}
              style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && styles.pressed]}>
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {choice === 'pick' && calendarOpen && (
        <PayDateCalendar today={today} selected={picked} onSelect={date => { setPicked(date); setCalendarOpen(false); }} />
      )}
      {choice === 'pick' && !calendarOpen && picked && (
        <Pressable accessibilityRole="button" onPress={() => setCalendarOpen(true)} style={styles.link}>
          <Text style={styles.linkText}>날짜 다시 고르기</Text>
        </Pressable>
      )}

      <SectionLabel text="지급 방법" />
      <Segment label="지급 방법" options={METHOD_OPTIONS} value={method} onChange={setMethod} />

      <SectionLabel text="공제" hint="숫자를 눌러 고칠 수 있어요" />
      {groups.map(group => (
        <DeductionBlock key={group.laborerId} name={nameOf(group.laborerId)} days={group.entries.length} gross={group.gross}
          estimate={group.estimate} actual={group.actual} error={errors[group.laborerId]}
          onChange={(key, value) => setGroups(current => setDeduction(current, group.laborerId, key, value))}
          onReset={key => setGroups(current => resetDeduction(current, group.laborerId, key))} />
      ))}
      <View style={styles.total}>
        <Text style={styles.totalLabel}>실수령 합계 · {groups.length}명</Text>
        <NumericText style={styles.totalValue}>{won(totalNet(groups))}</NumericText>
      </View>
      <GrayNote text="소득세 예상값은 이번에 함께 바꾸는 날들을 합쳐 계산했어요. 합계가 1,000원 미만이면 떼지 않아요. 실제로 뗀 금액이 다르면 고쳐 주세요." />
    </LaborSheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: Radius.pill, backgroundColor: Colors.chipBg, justifyContent: 'center' },
  chipOn: { backgroundColor: Colors.bg },
  chipText: { fontSize: Type.base, fontWeight: '600', color: Colors.gray600 },
  chipTextOn: { color: Colors.action, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontSize: Type.sm, fontWeight: '600', color: Colors.action },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 4, gap: 12 },
  totalLabel: { fontSize: Type.base, fontWeight: '700', color: Colors.black },
  totalValue: { fontSize: Type.xl, fontWeight: '700', color: Colors.black },
});
