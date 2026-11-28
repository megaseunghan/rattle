/* design-system: DESIGN.md — 수습 마지막 날 달력. 입사일부터 3개월 끝나는 날까지만 고를 수 있다. */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../../icons/AppIcon';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { Radius, Type } from '../../../constants/designTokens';
import { formatKoreanDate, WEEKDAYS } from '../pickers';
import { calendarCells, shiftMonth } from './probationValues';

export interface ProbationCalendarProps {
  start: string;
  max: string;
  selected: string;
  onSelect: (iso: string) => void;
}

const monthOf = (iso: string) => ({ year: +iso.slice(0, 4), month: +iso.slice(5, 7) });
const monthIndex = ({ year, month }: { year: number; month: number }) => year * 12 + month;

export function ProbationCalendar({ start, max, selected, onSelect }: ProbationCalendarProps) {
  const [view, setView] = useState(() => monthOf(selected || max));
  // 빠른 칩으로 날짜가 바뀌면 그 달을 보여 준다.
  useEffect(() => { if (selected) setView(monthOf(selected)); }, [selected]);
  const shown = monthIndex(view) < monthIndex(monthOf(start)) || monthIndex(view) > monthIndex(monthOf(max)) ? monthOf(selected || max) : view;
  const canPrev = monthIndex(shown) > monthIndex(monthOf(start));
  const canNext = monthIndex(shown) < monthIndex(monthOf(max));
  const { leading, dates } = calendarCells(shown.year, shown.month);
  const cells: (string | null)[] = [...Array(leading).fill(null), ...dates];

  return <View style={styles.box}>
    <View style={styles.head}>
      <Pressable accessibilityRole="button" accessibilityLabel="이전 달" disabled={!canPrev} onPress={() => setView(shiftMonth(shown.year, shown.month, -1))}
        style={[styles.nav, !canPrev && styles.off]}><AppIcon name="chevron-back" size={20} color={Colors.gray700} /></Pressable>
      <Text style={styles.month} accessibilityRole="header">{shown.year}년 {shown.month}월</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="다음 달" disabled={!canNext} onPress={() => setView(shiftMonth(shown.year, shown.month, 1))}
        style={[styles.nav, !canNext && styles.off]}><AppIcon name="chevron-forward" size={20} color={Colors.gray700} /></Pressable>
    </View>
    <View style={styles.week} importantForAccessibility="no-hide-descendants">
      {WEEKDAYS.map(day => <Text key={day} style={styles.weekday}>{day}</Text>)}
    </View>
    <View style={styles.grid}>
      {cells.map((date, i) => {
        if (!date) return <View key={`blank-${i}`} style={styles.cell} />;
        const disabled = date < start || date > max;
        const isSelected = date === selected;
        const inRange = !disabled && date >= start && date < selected;
        return <Pressable key={date} disabled={disabled} onPress={() => onSelect(date)} accessibilityRole="button"
          accessibilityLabel={`${formatKoreanDate(date, { weekday: false })}${isSelected ? ', 선택됨' : ''}`}
          accessibilityState={{ disabled, selected: isSelected }} style={styles.cell}>
          <View style={[styles.day, inRange && styles.inRange, isSelected && styles.selected]}>
            <Text style={[styles.dayText, disabled && styles.dayOff, inRange && styles.inRangeText, isSelected && styles.selectedText]}>{+date.slice(8)}</Text>
          </View>
        </Pressable>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderColor: Colors.gray200, borderRadius: Radius.xl, padding: 12, marginTop: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nav: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.3 },
  month: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.md, color: Colors.black },
  week: { flexDirection: 'row', marginTop: 4 },
  weekday: { flex: 1, textAlign: 'center', fontFamily: Fonts.wantedRegular, fontSize: Type.xs, color: Colors.gray500 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  day: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  inRange: { backgroundColor: Colors.bg },
  selected: { backgroundColor: Colors.action },
  dayText: { fontFamily: Fonts.geistMedium, fontSize: Type.md, color: Colors.black, fontVariant: ['tabular-nums'] },
  dayOff: { color: Colors.gray300 },
  inRangeText: { color: Colors.action },
  selectedText: { color: Colors.white, fontFamily: Fonts.geistSemiBold },
});
