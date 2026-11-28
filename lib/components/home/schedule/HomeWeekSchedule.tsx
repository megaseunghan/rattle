/**
 * S04 홈 근무표(2026-11-27 확정 시안): 이번 주 요일 줄 + 사람별 시간 막대(HH:MM–HH:MM), 직원/파트타이머 탭.
 * 요일 글자는 모두 검은색이고 고른 날만 파란 바탕이다. 저장된 고정 근무만 그린다.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../../constants/colors';
import { Fonts } from '../../../../constants/fonts';
import { CardStyle, Type } from '../../../../constants/designTokens';
import type { Employee } from '../../../../types';
import { useAuth } from '../../../contexts/AuthContext';
import { useHomeWeekSchedule } from '../../../hooks/useHomeWeekSchedule';
import { getErrorMessage } from '../../../utils/error';
import { AppIcon } from '../../../icons/AppIcon';
import { ErrorMessage } from '../../ErrorMessage';
import { Skeleton, SkeletonGroup } from '../../skeleton';
import { NumericText } from '../../ui/NumericText';
import { HomeSectionHeader } from '../HomeSectionHeader';
import {
  axisRange, axisTicks, crewForDay, kstNow, position, shiftState, weekDays,
  type CrewRow, type CrewType, type ShiftState, type WeekDay,
} from './weekSchedule';

const LIMIT = 6;
const NAME_WIDTH = 52;
const TYPE_LABEL: Record<CrewType, string> = { staff: '직원', part: '파트타이머' };

function useKstNow(active: boolean) {
  const [now, setNow] = useState(() => kstNow());
  useEffect(() => {
    if (!active) return;
    setNow(kstNow());
    const timer = setInterval(() => setNow(kstNow()), 60_000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export interface HomeWeekScheduleProps {
  active: boolean;
  refreshKey: number;
  employees: readonly Employee[];
  /** 직원 목록을 아직 못 받았거나 못 받았으면 근무를 '없음'으로 보이지 않는다. */
  employeesState?: 'loading' | 'error' | 'ready';
  onRetryEmployees?: () => void;
}

export function HomeWeekSchedule({ active, refreshKey, employees, employeesState = 'ready', onRetryEmployees }: HomeWeekScheduleProps) {
  const { store, user } = useAuth();
  const query = useHomeWeekSchedule(active, refreshKey);
  const now = useKstNow(active);
  const days = useMemo(() => weekDays(now.date), [now.date]);
  const [selected, setSelected] = useState(now.date);
  const [type, setType] = useState<CrewType>('staff');
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setSelected(now.date); setType('staff'); setExpanded(false); }, [now.date, store?.id, user?.id]);
  const day = days.find(item => item.date === selected) ?? days.find(item => item.kind === 'today')!;
  const schedules = query.data ?? [];
  const range = useMemo(() => axisRange(days.flatMap(item => crewForDay(schedules, employees, item.dow))), [days, schedules, employees]);
  const crew = useMemo(() => crewForDay(schedules, employees, day.dow), [schedules, employees, day.dow]);
  const ready = !!query.data && employeesState === 'ready';
  const counts = ready ? { staff: crew.filter(row => row.type === 'staff').length, part: crew.filter(row => row.type === 'part').length } : null;
  const list = crew.filter(row => row.type === type);
  const shown = expanded ? list : list.slice(0, LIMIT);
  return <View style={styles.root}>
    <HomeSectionHeader title="근무표" tabsLabel="근무자 구분" selected={type} onSelect={id => { setType(id); setExpanded(false); }}
      tabs={[{ id: 'staff', label: '직원', count: counts?.staff ?? null }, { id: 'part', label: '파트타이머', count: counts?.part ?? null }]} />
    <View style={styles.card}>
      <WeekStrip days={days} selected={day.date} onSelect={date => { setSelected(date); setExpanded(false); }} />
      {query.isError && !query.data ? <ErrorMessage message={getErrorMessage(query.error, '근무표를 불러오지 못했어요.')} onRetry={() => { void query.refetch(); }} />
        : employeesState === 'error' ? <ErrorMessage message="근무표를 불러오지 못했어요." onRetry={onRetryEmployees} />
        : <>
          <Axis range={range} />
          {!ready ? <CrewSkeleton /> : list.length ? <View accessibilityRole="list">
            {shown.map(row => <CrewBar key={row.employeeId} row={row} range={range} state={shiftState(row, day.kind, now.minutes)} />)}
          </View> : <Text style={styles.empty}>이날은 {TYPE_LABEL[type]} 근무가 없어요</Text>}
          {list.length > LIMIT && <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)}
            style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
            <Text style={styles.moreText}>{expanded ? '접기' : `${list.length - LIMIT}명 더 보기`}</Text>
            <AppIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.gray600} accessible={false} />
          </Pressable>}
        </>}
    </View>
  </View>;
}

function WeekStrip({ days, selected, onSelect }: { days: readonly WeekDay[]; selected: string; onSelect: (date: string) => void }) {
  return <View style={styles.strip}>
    {days.map(day => {
      const on = day.date === selected;
      return <Pressable key={day.date} accessibilityRole="button" accessibilityState={{ selected: on }}
        accessibilityLabel={`${day.letter}요일${day.kind === 'today' ? ', 오늘' : ''}`} onPress={() => onSelect(day.date)}
        style={({ pressed }) => [styles.day, on && styles.daySelected, pressed && styles.pressed]}>
        <Text style={[styles.dayLetter, on && styles.onText]}>{day.letter}</Text>
        <Text style={[styles.today, on && styles.onText]}>{day.kind === 'today' ? '오늘' : ''}</Text>
      </Pressable>;
    })}
  </View>;
}

function Axis({ range }: { range: { start: number; end: number } }) {
  const span = range.end - range.start;
  return <View style={styles.axis} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {axisTicks(range).map(tick => <NumericText key={tick.minutes}
      style={[styles.tick, { left: `${(tick.minutes - range.start) / span * 100}%` }]}>{tick.label}</NumericText>)}
  </View>;
}

const STATE_LABEL: Partial<Record<ShiftState, string>> = { on: ', 근무 중', done: ', 퇴근' };
function CrewBar({ row, range, state }: { row: CrewRow; range: { start: number; end: number }; state: ShiftState }) {
  const { left, width } = position(range, row);
  const tone = state === 'on' ? styles.barOn : state === 'done' ? styles.barDone : styles.barPlan;
  const text = state === 'on' ? styles.onText : state === 'done' ? styles.barDoneText : styles.barPlanText;
  return <View style={styles.crewRow} accessible accessibilityLabel={`${row.name}, ${TYPE_LABEL[row.type]}, ${row.label.replace('–', '부터 ')}까지${STATE_LABEL[state] ?? ''}`}>
    <Text style={styles.crewName} numberOfLines={1}>{row.name}</Text>
    <View style={styles.track}>
      <View style={[styles.bar, tone, { left: `${left * 100}%`, width: `${width * 100}%` }]}>
        <NumericText style={[styles.barText, text]} numberOfLines={1}>{row.label}</NumericText>
      </View>
    </View>
  </View>;
}

function CrewSkeleton() {
  return <SkeletonGroup label="근무표를 불러오는 중이에요">
    {[[0, 0.6], [0.08, 0.6], [0.15, 0.6], [0.3, 0.68]].map(([left, width], index) => <View key={index} style={styles.crewRow}>
      <View style={styles.crewNameBox}><Skeleton width={28} height={12} /></View>
      <View style={styles.track}><Skeleton width={`${width * 100}%`} height={22} radius={6} style={{ position: 'absolute', left: `${left * 100}%`, top: 4 }} /></View>
    </View>)}
  </SkeletonGroup>;
}

const styles = StyleSheet.create({
  root: { gap: 4 },
  card: { ...CardStyle, padding: 14, gap: 6 },
  strip: { flexDirection: 'row', gap: 2 },
  day: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  daySelected: { backgroundColor: Colors.action },
  dayLetter: { fontFamily: Fonts.wantedSemiBold, fontSize: 16, lineHeight: 20, color: Colors.black },
  today: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.xs, lineHeight: 13, minHeight: 13, color: Colors.action },
  onText: { color: Colors.white },
  axis: { height: 16, marginLeft: NAME_WIDTH, marginRight: 14, marginTop: 4 },
  tick: { position: 'absolute', fontSize: Type.xs, color: Colors.gray500, transform: [{ translateX: -4 }] },
  crewRow: { flexDirection: 'row', alignItems: 'center', height: 32 },
  crewName: { width: NAME_WIDTH, paddingRight: 6, fontFamily: Fonts.wantedSemiBold, fontSize: Type.sm, color: Colors.black },
  crewNameBox: { width: NAME_WIDTH },
  track: { flex: 1, height: 30, marginRight: 14 },
  bar: { position: 'absolute', top: 2, bottom: 2, borderRadius: 6, justifyContent: 'center', paddingHorizontal: 6, overflow: 'hidden' },
  barOn: { backgroundColor: Colors.action },
  barPlan: { backgroundColor: Colors.bg },
  barDone: { backgroundColor: Colors.gray100 },
  barText: { fontSize: Type.xs, fontWeight: '600' },
  barPlanText: { color: Colors.action },
  barDoneText: { color: Colors.gray500 },
  empty: { paddingVertical: 18, textAlign: 'center', fontFamily: Fonts.wantedRegular, fontSize: Type.sm, color: Colors.gray500 },
  more: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  moreText: { fontFamily: Fonts.wantedMedium, fontSize: Type.sm, color: Colors.gray600 },
  pressed: { opacity: 0.7 },
});
