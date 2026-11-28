/* design-system: DESIGN.md — S54 지급일 '다른 날' 시트 안 달력. 오늘 이후와 마지막 근무일 전 날짜는 고를 수 없다. */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Radius, Type } from '../../../constants/designTokens';
import { NumericText } from '../ui/NumericText';
import { calendarCells, monthLabel, shiftMonth, WEEKDAYS } from './format';

interface PayDateCalendarProps {
  today: string;
  selected: string | null;
  /** 이날보다 앞은 고를 수 없다(마지막 근무일). */
  minDate?: string | null;
  onSelect: (date: string) => void;
}

export function PayDateCalendar({ today, selected, minDate, onSelect }: PayDateCalendarProps) {
  const [month, setMonth] = useState((selected ?? today).slice(0, 7));
  const canNext = month < today.slice(0, 7);
  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="이전 달" onPress={() => setMonth(m => shiftMonth(m, -1))} style={styles.nav}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.month}>{monthLabel(month)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="다음 달" accessibilityState={{ disabled: !canNext }} disabled={!canNext}
          onPress={() => setMonth(m => shiftMonth(m, 1))} style={[styles.nav, !canNext && styles.off]}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map(day => <Text key={day} style={styles.weekday}>{day}</Text>)}
        {calendarCells(month).map((date, index) => {
          if (!date) return <View key={`blank-${index}`} style={styles.cell} />;
          const future = date > today;
          const beforeWork = !!minDate && date < minDate;
          const off = future || beforeWork;
          const isSelected = date === selected;
          return (
            <Pressable key={date} disabled={off} onPress={() => onSelect(date)} style={styles.cell}
              accessibilityRole="button" accessibilityState={{ disabled: off, selected: isSelected }}
              accessibilityLabel={`${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일${future ? ', 아직 오지 않은 날' : beforeWork ? ', 근무일 전이라 고를 수 없어요' : ''}`}>
              <View style={[styles.day, isSelected && styles.daySelected]}>
                <NumericText style={[styles.dayText, off && styles.dayFuture, isSelected && styles.dayTextSelected]}>{Number(date.slice(8))}</NumericText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.homeBorder, padding: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nav: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: Type.xl, color: Colors.gray600 },
  off: { opacity: 0.3 },
  month: { fontSize: Type.md, fontWeight: '700', color: Colors.black },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: Type.xs, color: Colors.gray400, paddingVertical: 6 },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: Colors.action },
  dayText: { fontSize: Type.base, fontWeight: '500', color: Colors.black },
  dayFuture: { color: Colors.gray300 },
  dayTextSelected: { color: Colors.white, fontWeight: '700' },
});
