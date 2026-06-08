import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { getMonthlyAttendanceRecords } from '../services/attendance';
import { Attendance } from '../../types';

interface DaySummary {
  day: number;
  clockIn?: string;
  clockOut?: string;
  workedMinutes: number;
  dailyWage: number;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function fmtTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function buildDayMap(records: Attendance[]): Record<number, DaySummary> {
  const map: Record<number, DaySummary> = {};
  for (const r of records) {
    const day = new Date(r.timestamp).getDate();
    const acc = map[day] ?? { day, workedMinutes: 0, dailyWage: 0 };
    if (r.type === 'clock_in' && !acc.clockIn) acc.clockIn = r.timestamp;
    if (r.type === 'clock_out') {
      acc.clockOut = r.timestamp;
      acc.workedMinutes += Number(r.worked_minutes ?? 0);
      acc.dailyWage += Number(r.daily_wage ?? 0);
    }
    map[day] = acc;
  }
  return map;
}

export function AttendanceCalendar({ storeId, employeeId }: { storeId: string; employeeId: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getMonthlyAttendanceRecords(storeId, employeeId, year, month)
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [storeId, employeeId, year, month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  const dayMap = buildDayMap(records);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const workedDays = Object.values(dayMap).filter(d => d.dailyWage > 0 || d.workedMinutes > 0);
  const totalWage = workedDays.reduce((s, d) => s + d.dailyWage, 0);
  const totalMinutes = workedDays.reduce((s, d) => s + d.workedMinutes, 0);
  const todayDate = now.getFullYear() === year && now.getMonth() + 1 === month ? now.getDate() : -1;

  return (
    <View style={styles.wrap}>
      {/* 월 네비게이션 */}
      <View style={styles.navRow}>
        <TouchableOpacity onPress={prevMonth} style={styles.navBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={18} color={Colors.gray600} />
        </TouchableOpacity>
        <Text style={styles.navLabel}>{year}년 {month}월</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.navBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-forward" size={18} color={Colors.gray600} />
        </TouchableOpacity>
      </View>

      {/* 합계 */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>근무</Text>
          <Text style={styles.summaryValue}>{workedDays.length}일</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>시간</Text>
          <Text style={styles.summaryValue}>{Math.floor(totalMinutes / 60)}시간 {totalMinutes % 60}분</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>세전 누적</Text>
          <Text style={[styles.summaryValue, styles.summaryWage]}>{totalWage.toLocaleString()}원</Text>
        </View>
      </View>

      {/* 캘린더 그리드 */}
      <View style={styles.calCard}>
        <View style={styles.weekHeader}>
          {WEEKDAYS.map((w, i) => (
            <Text key={w} style={[styles.weekday, i === 0 && styles.sunday, i === 6 && styles.saturday]}>{w}</Text>
          ))}
        </View>
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ paddingVertical: 32 }} />
        ) : (
          <View style={styles.grid}>
            {cells.map((day, idx) => {
              if (day == null) return <View key={`e${idx}`} style={styles.cell} />;
              const d = dayMap[day];
              const worked = d && (d.dailyWage > 0 || d.workedMinutes > 0);
              const isToday = day === todayDate;
              return (
                <View key={day} style={styles.cell}>
                  <View style={[styles.dayCircle, worked && styles.dayWorked, isToday && styles.dayToday]}>
                    <Text style={[styles.dayNum, worked && styles.dayNumWorked, isToday && styles.dayNumToday]}>{day}</Text>
                  </View>
                  {worked
                    ? <Text style={styles.cellWage} numberOfLines={1}>{Math.round(d.dailyWage / 1000)}k</Text>
                    : <Text style={styles.cellWage}> </Text>}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* 일별 상세 */}
      {!loading && workedDays.length > 0 && (
        <View style={styles.listCard}>
          {workedDays
            .sort((a, b) => b.day - a.day)
            .map((d, i) => (
              <View key={d.day} style={[styles.listRow, i !== workedDays.length - 1 && styles.listRowBorder]}>
                <View style={styles.listDateWrap}>
                  <Text style={styles.listDate}>{month}/{d.day}</Text>
                </View>
                <View style={styles.listTimeWrap}>
                  <Text style={styles.listTime}>{fmtTime(d.clockIn)} ~ {fmtTime(d.clockOut)}</Text>
                  <Text style={styles.listMinutes}>{Math.floor(d.workedMinutes / 60)}시간 {d.workedMinutes % 60}분</Text>
                </View>
                <Text style={styles.listWage}>{d.dailyWage.toLocaleString()}원</Text>
              </View>
            ))}
        </View>
      )}

      {!loading && workedDays.length === 0 && (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={28} color={Colors.gray300} />
          <Text style={styles.emptyText}>이번 달 출퇴근 기록이 없어요</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: Colors.white, borderWidth: 0.5, borderColor: Colors.gray100 },
  navLabel: { fontSize: 15, fontWeight: '700', color: Colors.black },

  summaryRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.gray100, paddingVertical: 14 },
  summaryItem: { flex: 1, alignItems: 'center', gap: 3 },
  summaryDivider: { width: 0.5, height: 28, backgroundColor: Colors.gray100 },
  summaryLabel: { fontSize: 11, color: Colors.gray400 },
  summaryValue: { fontSize: 14, fontWeight: '700', color: Colors.black },
  summaryWage: { color: Colors.primary },

  calCard: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.gray100, padding: 12 },
  weekHeader: { flexDirection: 'row', marginBottom: 6 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: Colors.gray400 },
  sunday: { color: '#DC2626' },
  saturday: { color: '#2563EB' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4, gap: 2 },
  dayCircle: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  dayWorked: { backgroundColor: Colors.tinted },
  dayToday: { borderWidth: 1.5, borderColor: Colors.primary },
  dayNum: { fontSize: 13, color: Colors.gray600 },
  dayNumWorked: { color: Colors.primary, fontWeight: '700' },
  dayNumToday: { fontWeight: '700' },
  cellWage: { fontSize: 9, color: Colors.primary, fontWeight: '600', height: 12 },

  listCard: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.gray100 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  listRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  listDateWrap: { width: 44 },
  listDate: { fontSize: 13, fontWeight: '700', color: Colors.black },
  listTimeWrap: { flex: 1, gap: 2 },
  listTime: { fontSize: 13, color: Colors.gray600 },
  listMinutes: { fontSize: 11, color: Colors.gray400 },
  listWage: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 13, color: Colors.gray400 },
});
