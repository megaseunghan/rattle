/* design-system: DESIGN.md — S54 근무한 날 고르기(가로 날짜 띠). 이미 기록한 날과 오늘 이후는 고를 수 없다. */
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Radius, Type } from '../../../constants/designTokens';
import { isWeekend, monthDates } from '../../payroll';
import { NumericText } from '../ui/NumericText';
import { dayLabel, weekdayOf } from './format';

const CHIP_WIDTH = 52;
const CHIP_GAP = 6;

interface DayStripProps {
  yearMonth: string;
  today: string;
  selected: string | null;
  usedDates: ReadonlySet<string>;
  onSelect: (date: string) => void;
}

export function DayStrip({ yearMonth, today, selected, usedDates, onSelect }: DayStripProps) {
  const scroll = useRef<ScrollView>(null);
  const dates = monthDates(yearMonth);
  const focusIndex = Math.max(0, dates.indexOf(selected ?? (today.startsWith(yearMonth) ? today : dates[0])));
  useEffect(() => {
    const timer = setTimeout(() => scroll.current?.scrollTo({ x: Math.max(0, focusIndex * (CHIP_WIDTH + CHIP_GAP) - 120), animated: false }), 0);
    return () => clearTimeout(timer);
    // 처음 열 때(달이 바뀔 때)만 맞춘다. 고를 때마다 움직이면 손가락 아래 날짜가 바뀐다.
  }, [yearMonth]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {dates.map(date => {
        const used = usedDates.has(date);
        const disabled = used || date > today;
        const isSelected = date === selected;
        const weekend = isWeekend(date);
        return (
          <Pressable key={date} disabled={disabled} onPress={() => onSelect(date)}
            accessibilityRole="button" accessibilityState={{ disabled, selected: isSelected }}
            accessibilityLabel={`${dayLabel(date)}${used ? ', 이미 기록함' : date > today ? ', 아직 오지 않은 날' : ''}`}
            style={[styles.chip, isSelected && styles.chipOn, disabled && styles.chipOff]}>
            <Text style={[styles.weekday, weekend && styles.weekend, isSelected && styles.textOn]}>{weekdayOf(date)}</Text>
            <NumericText style={[styles.day, isSelected && styles.textOn]}>{Number(date.slice(8))}</NumericText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: CHIP_GAP, paddingVertical: 2 },
  chip: { width: CHIP_WIDTH, height: 64, borderRadius: Radius.lg, backgroundColor: Colors.chipBg, alignItems: 'center', justifyContent: 'center', gap: 2 },
  chipOn: { backgroundColor: Colors.action },
  chipOff: { opacity: 0.35 },
  weekday: { fontSize: Type.xs, color: Colors.gray500 },
  weekend: { color: Colors.action },
  day: { fontSize: Type.lg, fontWeight: '700', color: Colors.black },
  textOn: { color: Colors.white },
});
