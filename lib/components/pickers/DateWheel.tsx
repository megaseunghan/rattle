/* design-system: DESIGN.md — 년·월·일 휠(1970년부터, 그달 날짜 수와 요일 자동). 직원 합류·합류 승인·직원 정보·일용근로자 공용. */
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { Type } from '../../../constants/designTokens';
import { WheelColumn } from './WheelColumn';
import { daysInMonth, joinIsoDate, splitIsoDate, wheelYears } from './dateParts';

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1));

export interface DateWheelProps {
  /** 'YYYY-MM-DD'. 잘못된 값이면 fallback 날짜를 보여 준다. */
  value: string;
  onChange: (iso: string) => void;
  /** value가 비었거나 잘못됐을 때 보여 줄 날짜(기본: 오늘이 아니라 부모가 정한 값) */
  fallback: string;
  /** 마지막 연도(기본: fallback 연도 + 1) */
  maxYear?: number;
  disabled?: boolean;
  onMoving?: (moving: boolean) => void;
  /** 휠 아래 한 줄 안내(예: '2026년 12월 1일(화)부터 일해요.') */
  caption?: string;
}

export function DateWheel({ value, onChange, fallback, maxYear, disabled, onMoving, caption }: DateWheelProps) {
  const parts = splitIsoDate(value) ?? splitIsoDate(fallback) ?? { year: 2026, month: 1, day: 1 };
  const years = wheelYears(Math.max(maxYear ?? parts.year + 1, parts.year));
  const days = Array.from({ length: daysInMonth(parts.year, parts.month) }, (_, i) => String(i + 1));
  const set = (year: number, month: number, day: number) => onChange(joinIsoDate(year, month, day));
  return <View>
    <View style={styles.labels} importantForAccessibility="no-hide-descendants">
      {['년', '월', '일'].map(unit => <Text key={unit} style={styles.label}>{unit}</Text>)}
    </View>
    <View style={styles.wheel}>
      <View pointerEvents="none" style={styles.band} />
      <WheelColumn label="년" unit="년" options={years.map(String)} index={Math.max(0, years.indexOf(parts.year))}
        onChange={i => set(years[i], parts.month, parts.day)} disabled={disabled} onMoving={onMoving} />
      <WheelColumn label="월" unit="월" options={MONTHS} index={parts.month - 1}
        onChange={i => set(parts.year, i + 1, parts.day)} disabled={disabled} onMoving={onMoving} />
      <WheelColumn key={`${parts.year}-${parts.month}`} label="일" unit="일" options={days} index={parts.day - 1}
        onChange={i => set(parts.year, parts.month, i + 1)} disabled={disabled} onMoving={onMoving} />
    </View>
    {!!caption && <Text style={styles.caption} accessibilityLiveRegion="polite">{caption}</Text>}
  </View>;
}

export const wheelStyles = StyleSheet.create({
  // 휠 맨 위 반쯤 잘린 줄이 단위 글자에 붙어 겹쳐 보이지 않게 띄운다.
  labels: { flexDirection: 'row', marginBottom: 12 },
  label: { flex: 1, textAlign: 'center', fontFamily: Fonts.wantedMedium, fontSize: Type.sm, color: Colors.gray500 },
  wheel: { flexDirection: 'row', gap: 8, position: 'relative' },
  band: { position: 'absolute', left: 0, right: 0, top: 68, height: 44, borderRadius: 12, backgroundColor: Colors.chipBg },
  caption: { marginTop: 12, fontFamily: Fonts.wantedRegular, fontSize: Type.base, lineHeight: 21, color: Colors.gray600 },
});
const styles = wheelStyles;
