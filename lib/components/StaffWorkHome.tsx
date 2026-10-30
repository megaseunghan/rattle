import { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import type { Employee } from '../../types';
import { useAuth } from '../contexts/AuthContext';
import { queryClient, useQueryScope } from '../query';
import { listCleaningItems, listCleaningLogsByDate, isCleaningItemApplicableToday } from '../services/cleaning';
import { getEmployeeSchedule } from '../services/schedule';
import { getMyPayroll } from '../services/payroll';
import { ErrorMessage } from './ErrorMessage';

export function StaffWorkHome({ employee, active, onStock, isPartTime = false, refreshKey = 0 }: { refreshKey?: number; isPartTime?: boolean; employee: Employee | null | undefined; active: boolean; onStock: () => void }) {
  const { store } = useAuth();
  const scope = useQueryScope();
  const kst = new Date(Date.now() + 9 * 3600_000);
  const date = kst.toISOString().slice(0, 10), month = date.slice(0, 7), weekday = kst.getUTCDay();
  const query = useQuery({ queryKey: ['staff-work-home', scope, store?.id, employee?.id, date], enabled: false,
    queryFn: async () => {
      const [items, logs, schedule, payroll] = await Promise.all([
        listCleaningItems(store!.id), listCleaningLogsByDate(store!.id, date),
        employee ? getEmployeeSchedule(employee.id) : Promise.resolve([]),
        employee ? getMyPayroll(employee.id, month) : Promise.resolve(null),
      ]);
      const todayItems = items.filter(item => isCleaningItemApplicableToday(item, weekday));
      const checked = new Set(logs.map(log => log.item_id));
      return { count: todayItems.length, done: todayItems.filter(item => checked.has(item.id)).length,
        today: schedule.find(day => day.day_of_week === weekday), payroll };
    }, staleTime: 15_000,
  }, queryClient);
  useFocusEffect(useCallback(() => { if (active && store) void query.refetch(); }, [active, store?.id, employee?.id, date, scope, refreshKey]));
  const data = query.data;
  const scheduleText = !employee ? '계정 연결을 확인해주세요' : !data ? '불러오는 중' : !data.today ? '등록된 스케줄이 없어요'
    : !data.today.is_working ? '오늘은 쉬는 날이에요' : `${data.today.start_time?.slice(0, 5)} – ${data.today.end_time?.slice(0, 5)}`;
  const cards = [
    { title: '오늘 체크리스트', value: data ? `${data.done} / ${data.count} 완료` : '불러오는 중', hint: '오픈부터 마감까지 챙겨요', icon: 'checkbox-outline' as const, onPress: () => router.push('/cleaning') },
    { title: '내 스케줄', value: scheduleText, hint: '주간 스케줄 확인·변경 요청', icon: 'calendar-outline' as const, onPress: () => router.push('/mypage/schedule') },
    { title: `${Number(month.slice(5))}월 내 급여`, value: !employee ? '계정 연결을 확인해주세요' : !data ? '불러오는 중' : data.payroll ? `${data.payroll.net_pay.toLocaleString('ko-KR')}원` : '아직 작성되지 않았어요', hint: isPartTime ? '실근무 시간 제출·명세 확인' : '내 급여 명세 확인', icon: 'wallet-outline' as const, onPress: () => router.push('/mypage/payslip') },
    { title: '재고 확인·수정', value: '남은 수량을 업데이트해요', hint: '품절 임박 품목도 함께 확인해요', icon: 'cube-outline' as const, onPress: onStock },
  ];
  return <View style={{ gap: 12 }}>
    <View style={styles.intro}><Text style={styles.eyebrow}>{Number(date.slice(5, 7))}월 {Number(date.slice(8))}일 · 나의 매장 업무</Text><Text style={styles.heading}>{employee?.name ? `${employee.name}님, 오늘 할 일을 확인해요` : '오늘 할 일을 확인해요'}</Text></View>
    {query.isError && <ErrorMessage message="오늘 업무를 불러오지 못했어요. 다시 시도해주세요." onRetry={() => { void query.refetch(); }} />}
    {cards.map(card => <Pressable key={card.title} style={styles.card} onPress={card.onPress} accessibilityRole="button">
      <View style={styles.icon}><Ionicons name={card.icon} size={22} color={Colors.primary} /></View>
      <View style={{ flex: 1, gap: 5 }}><Text style={styles.label}>{card.title}</Text><Text style={styles.value}>{query.isError ? '다시 확인해주세요' : card.value}</Text><Text style={styles.hint}>{card.hint}</Text></View>
      <Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
    </Pressable>)}
    {isPartTime && <Pressable style={styles.submit} onPress={() => router.push('/mypage/work-minutes')} accessibilityRole="button"><Text style={{ color: Colors.primary, fontWeight: '700' }}>이번 달 실근무 시간 제출하기 →</Text></Pressable>}
  </View>;
}
const styles = StyleSheet.create({
  intro: { gap: 10, paddingVertical: 12 }, eyebrow: { fontSize: 13, color: Colors.gray500 }, heading: { fontSize: 23, lineHeight: 32, color: Colors.black, fontWeight: '700' },
  card: { backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 120 },
  icon: { width: 42, height: 42, backgroundColor: Colors.tinted, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, color: Colors.gray600 }, value: { fontSize: 17, fontWeight: '700', color: Colors.black }, hint: { fontSize: 12, color: Colors.gray500, lineHeight: 18 }, submit: { padding: 20, minHeight: 52 },
});
