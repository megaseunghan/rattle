import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import type { WeeklyScheduleDay } from '../services/adminDashboard';
const DAYS = [{ id: 1, label: '월' }, { id: 2, label: '화' }, { id: 3, label: '수' }, { id: 4, label: '목' }, { id: 5, label: '금' }, { id: 6, label: '토' }, { id: 0, label: '일' }];
export function DashboardSchedule({ days, error, partial = false, onManage }: { days?: WeeklyScheduleDay[]; error?: boolean; partial?: boolean; onManage?: () => void }) {
  const [weekday, setWeekday] = useState(new Date().getDay());
  const [page, setPage] = useState(0);
  const selected = days?.find(day => day.weekday === weekday);
  const shifts = selected?.shifts ?? [];
  const lastPage = Math.max(0, Math.ceil(shifts.length / 4) - 1);
  const currentPage = Math.min(page, lastPage);
  const max = Math.max(1, ...(days ?? []).map(day => day.headcount));
  return <View style={styles.card}>
    <View style={styles.heading}><Text style={styles.title}>요일별 스케줄</Text><Text style={styles.caption}>이번 주 · 예정 근무</Text></View>
    {onManage && <Pressable accessibilityRole="button" accessibilityLabel="선택한 매장 스케줄 관리" onPress={onManage} style={styles.manage}><Text style={styles.manageText}>스케줄 관리 ›</Text></Pressable>}
    {!days ? <Text style={styles.notice}>{error ? '스케줄을 불러오지 못했어요' : '스케줄을 불러오는 중이에요'}</Text> : <>
      {partial && <Text style={styles.notice}>일부 매장의 스케줄을 확인하지 못했어요. 조회된 매장만 표시해요.</Text>}
      <View style={styles.week}>{DAYS.map(day => {
        const info = days.find(item => item.weekday === day.id);
        const active = day.id === weekday;
        return <Pressable key={day.id} accessibilityRole="button" accessibilityLabel={`${day.label}요일 ${info?.headcount ?? 0}명`} accessibilityState={{ selected: active }} onPress={() => { setWeekday(day.id); setPage(0); }} style={({ pressed }) => [styles.day, active && styles.active, pressed && { opacity: 0.7 }]}>
          <Text style={[styles.dayLabel, active && styles.activeText]}>{day.label}</Text>
          <View style={styles.barTrack}><View style={[styles.bar, { height: `${((info?.headcount ?? 0) / max) * 100}%` }, active && { backgroundColor: Colors.white }]} /></View>
          <Text style={[styles.count, active && styles.activeText]}>{info?.headcount ?? 0}명</Text>
        </Pressable>;
      })}</View>
      <View style={styles.heading}><Text style={styles.dayTitle}>{DAYS.find(day => day.id === weekday)?.label}요일 · {selected?.headcount ?? 0}명</Text><Text style={styles.caption}>총 {selected?.totalHours ?? 0}시간</Text></View>
      {shifts.length === 0 ? <Text style={styles.notice}>등록된 근무가 없어요</Text> : <View>{shifts.slice(currentPage * 4, currentPage * 4 + 4).map((shift, i) => <View key={`${shift.employeeName}-${i}`} style={styles.shift}><Text style={styles.name} numberOfLines={2}>{shift.employeeName}</Text><Text style={styles.time}>{shift.start} – {shift.end}</Text></View>)}</View>}
      {lastPage > 0 && <View style={styles.pages}><Pressable accessibilityRole="button" accessibilityLabel="이전 근무자" disabled={currentPage === 0} onPress={() => setPage(currentPage - 1)} style={styles.pageButton}><Text style={{ color: currentPage === 0 ? Colors.gray300 : Colors.action }}>이전</Text></Pressable><Text style={styles.caption}>{currentPage + 1} / {lastPage + 1}</Text><Pressable accessibilityRole="button" accessibilityLabel="다음 근무자" disabled={currentPage === lastPage} onPress={() => setPage(currentPage + 1)} style={styles.pageButton}><Text style={{ color: currentPage === lastPage ? Colors.gray300 : Colors.action }}>다음</Text></Pressable></View>}
    </>}
  </View>;
}
const styles = StyleSheet.create({
  manage: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' }, manageText: { fontSize: 13, fontWeight: '600', color: Colors.action },
  card: { backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder, padding: 16, gap: 14 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.black }, caption: { fontSize: 12, color: Colors.gray500 },
  week: { flexDirection: 'row', gap: 4 }, day: { flex: 1, minHeight: 106, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.tinted },
  active: { backgroundColor: Colors.action }, activeText: { color: Colors.white }, dayLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600 },
  barTrack: { width: 10, height: 32, justifyContent: 'flex-end' }, bar: { minHeight: 2, backgroundColor: Colors.light, borderRadius: 5 }, count: { fontSize: 12, fontWeight: '700', color: Colors.action },
  dayTitle: { fontSize: 15, fontWeight: '700', color: Colors.black }, shift: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: Colors.gray200 },
  name: { flex: 1, fontSize: 13, color: Colors.gray700 }, time: { fontSize: 13, color: Colors.black, fontWeight: '600', fontVariant: ['tabular-nums'] }, notice: { fontSize: 13, color: Colors.gray500, lineHeight: 20, paddingVertical: 8 },
  pages: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 }, pageButton: { minWidth: 50, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
