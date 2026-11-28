/* design-system: DESIGN.md — 합류 승인 수습 시트(직원 정보 S05도 재사용).
 * 적용해요/적용 안 해요 → 수습 마지막 날(1·2·3개월 빠른 칩 + 달력, 입사일부터 3개월까지만) → 수습 중 급여 %(매장 기본값) → 최저임금 90% 미만 회색 안내. */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { Radius, Type } from '../../../constants/designTokens';
import { isIsoDate, maxProbationEnd } from '../../payroll';
import { formatKoreanDate } from '../pickers';
import { FieldSheet } from './FieldSheet';
import { GrayNotice } from './GrayNotice';
import { ProbationCalendar } from './ProbationCalendar';
import { UnderlineInput } from './UnderlineInput';
import {
  isStoreDefaultRate, parseRatePercent, PROBATION_QUICK_MONTHS, probationExample, probationFloorNotice, probationQuickEnd,
  probationSpanDays, type ProbationDraft, type ProbationMonths, type ProbationWageInput,
} from './probationValues';

export interface ProbationResult {
  is_probation: boolean;
  probation_ends_on: string | null;
  probation_rate: number | null;
}

export interface ProbationSheetProps {
  visible: boolean;
  joinedAt: string;
  initial: ProbationDraft;
  storeMonths: ProbationMonths | null | undefined;
  storeRate: number | null | undefined;
  wage: ProbationWageInput;
  busy?: boolean;
  onConfirm: (value: ProbationResult) => void;
  onClose: () => void;
}

export function ProbationSheet({ visible, joinedAt, initial, storeMonths, storeRate, wage, busy, onConfirm, onClose }: ProbationSheetProps) {
  const [draft, setDraft] = useState(initial);
  useEffect(() => { if (visible) setDraft(initial); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const validJoin = isIsoDate(joinedAt);
  const on = draft.isProbation && validJoin;
  const rate = parseRatePercent(draft.ratePercent);
  const canConfirm = !on || (rate != null && isIsoDate(draft.endsOn));

  function confirm() {
    if (!canConfirm) return;
    onConfirm(on ? { is_probation: true, probation_ends_on: draft.endsOn, probation_rate: rate } : { is_probation: false, probation_ends_on: null, probation_rate: null });
  }

  return <FieldSheet visible={visible} title="수습을 적용할까요?" onClose={onClose} tall={on}
    subtitle={validJoin ? `입사일 ${formatKoreanDate(joinedAt)}부터 계산돼요.` : '입사일을 먼저 정해 주세요.'}
    onConfirm={confirm} confirmDisabled={!canConfirm} busy={busy}>
    <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel="수습 적용">
      {([true, false] as const).map(value => {
        const active = value === on;
        const disabled = value && !validJoin;
        return <Pressable key={String(value)} accessibilityRole="radio" accessibilityState={{ checked: active, disabled }} disabled={disabled}
          onPress={() => setDraft(current => ({ ...current, isProbation: value }))}
          style={({ pressed }) => [styles.segmentItem, active && styles.segmentActive, pressed && styles.pressed, disabled && styles.off]}>
          <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{value ? '적용해요' : '적용 안 해요'}</Text>
        </Pressable>;
      })}
    </View>
    {on ? <ProbationDetails draft={draft} setDraft={setDraft} joinedAt={joinedAt} storeMonths={storeMonths} storeRate={storeRate} wage={wage} rate={rate} />
      : <Text style={styles.note}>처음부터 약속한 급여 그대로 줘요.</Text>}
  </FieldSheet>;
}

function ProbationDetails({ draft, setDraft, joinedAt, storeMonths, storeRate, wage, rate }: {
  draft: ProbationDraft; setDraft: (update: (current: ProbationDraft) => ProbationDraft) => void; joinedAt: string;
  storeMonths: ProbationMonths | null | undefined; storeRate: number | null | undefined; wage: ProbationWageInput; rate: number | null;
}) {
  const max = maxProbationEnd(joinedAt);
  const example = rate != null ? probationExample(wage, rate) : null;
  const notice = rate != null ? probationFloorNotice(wage, rate, joinedAt) : null;
  return <>
    <Text style={styles.label}>수습 마지막 날</Text>
    <View style={styles.endRow}>
      <Text style={styles.endDate} accessibilityLiveRegion="polite">{formatKoreanDate(draft.endsOn, { weekday: false })}</Text>
      <Text style={styles.span}>{probationSpanDays(joinedAt, draft.endsOn)}일</Text>
    </View>
    <View style={styles.chips}>
      {PROBATION_QUICK_MONTHS.map(months => {
        const end = probationQuickEnd(joinedAt, months);
        const active = end === draft.endsOn;
        const label = `${months}개월${months === storeMonths ? ' (매장 기본)' : ''}`;
        return <Pressable key={months} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }}
          onPress={() => setDraft(current => ({ ...current, endsOn: end }))}
          style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}>
          <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
        </Pressable>;
      })}
    </View>
    <ProbationCalendar start={joinedAt} max={max} selected={draft.endsOn} onSelect={endsOn => setDraft(current => ({ ...current, endsOn }))} />
    <Text style={styles.note}>입사일부터 3개월이 끝나는 {formatKoreanDate(max, { weekday: false })}까지 고를 수 있어요. 3개월이 지나면 급여를 줄일 수 없어요.</Text>
    <Text style={[styles.label, styles.rateLabel]}>수습 중 급여</Text>
    <UnderlineInput label="수습 중 급여 비율" value={draft.ratePercent} unit="%" numeric keyboardType="decimal-pad" maxLength={5}
      selectTextOnFocus trailing={isStoreDefaultRate(draft.ratePercent, storeRate) ? '매장 기본값' : undefined}
      onChangeText={text => setDraft(current => ({ ...current, ratePercent: text.replace(/[^\d.]/g, '') }))} />
    {rate == null ? <Text style={styles.note}>1~100% 사이로 적어 주세요.</Text>
      : notice ? <GrayNotice message={notice} /> : !!example && <Text style={styles.note}>{example}</Text>}
    <View style={styles.reference}><Text style={styles.referenceText}>1년 미만 계약이거나 단순노무 업무면 수습이어도 급여를 줄일 수 없어요.</Text></View>
  </>;
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', gap: 8 },
  segmentItem: { flex: 1, minHeight: 52, borderRadius: Radius.lg, backgroundColor: Colors.chipBg, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: Colors.bg },
  segmentText: { fontFamily: Fonts.wantedMedium, fontSize: Type.md, color: Colors.gray700 },
  segmentTextActive: { fontFamily: Fonts.wantedSemiBold, color: Colors.action },
  pressed: { opacity: 0.7 },
  off: { opacity: 0.4 },
  label: { marginTop: 22, fontFamily: Fonts.wantedMedium, fontSize: Type.sm, color: Colors.gray600 },
  rateLabel: { marginTop: 26 },
  endRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6 },
  endDate: { fontFamily: Fonts.wantedBold, fontSize: Type.xl, color: Colors.black },
  span: { fontFamily: Fonts.geistMedium, fontSize: Type.sm, color: Colors.gray500, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: Radius.pill, backgroundColor: Colors.chipBg, justifyContent: 'center' },
  chipActive: { backgroundColor: Colors.bg },
  chipText: { fontFamily: Fonts.wantedMedium, fontSize: Type.sm, color: Colors.gray700 },
  chipTextActive: { fontFamily: Fonts.wantedSemiBold, color: Colors.action },
  note: { marginTop: 12, fontFamily: Fonts.wantedRegular, fontSize: Type.sm, lineHeight: 20, color: Colors.gray600 },
  reference: { marginTop: 18, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.gray200 },
  referenceText: { fontFamily: Fonts.wantedRegular, fontSize: Type.sm, lineHeight: 20, color: Colors.gray500 },
});
