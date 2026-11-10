import { remainingScheduledDays } from '../../lib/utils/remainingSchedule';
import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { useSchedule } from '../../lib/hooks/useSchedule';
import { AppIcon } from '../../lib/icons/AppIcon';
import { AppBar, Button } from '../../lib/components/ui';
import { NumericText } from '../../lib/components/ui/NumericText';
import { getErrorMessage } from '../../lib/utils/error';
import { resolveSelfEmployee } from '../../lib/utils/resolveSelfEmployee';
import { ScheduleDayInput } from '../../types';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DISPLAY_DAYS = [1, 2, 3, 4, 5, 6, 0];
function defaultDays(): ScheduleDayInput[] {
  return WEEKDAYS.map((_, day_of_week) => ({ day_of_week, is_working: false, start_time: null, end_time: null }));
}
function toTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:00`;
}
function asDate(time: string): Date {
  const date = new Date();
  const [hours, minutes] = time.split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
}
function summary(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours >= 12 ? '오후' : '오전'} ${hours % 12 || 12}:${String(minutes).padStart(2, '0')}`;
}

function DayEditor({ day, onCancel, onApply }: {
  day: ScheduleDayInput;
  onCancel: () => void;
  onApply: (day: ScheduleDayInput, otherDays: number[]) => void;
}) {
  const [working, setWorking] = useState(day.is_working);
  const [start, setStart] = useState(day.start_time ?? '09:00:00');
  const [end, setEnd] = useState(day.end_time ?? '18:00:00');
  const [field, setField] = useState<'start' | 'end' | null>(null);
  const [others, setOthers] = useState<number[]>([]);
  return <View style={styles.editor} testID={`schedule-editor-${day.day_of_week}`}>
    <View style={styles.workRow}>
      <Text style={styles.body}>근무</Text>
      <Switch accessibilityLabel={`${WEEKDAYS[day.day_of_week]}요일 근무 여부`} value={working}
        onValueChange={value => { setWorking(value); setField(null); }}
        trackColor={{ false: Colors.gray200, true: Colors.primary }} thumbColor={Colors.white} />
    </View>
    {working && <>
      <View style={styles.timeButtons}>
        {(['start', 'end'] as const).map(key => <TouchableOpacity key={key}
          accessibilityRole="button" accessibilityLabel={`${key === 'start' ? '시작' : '종료'} 시간 ${summary(key === 'start' ? start : end)}`}
          accessibilityState={{ expanded: field === key }} activeOpacity={0.7}
          onPress={() => setField(value => value === key ? null : key)}
          style={[styles.timeButton, field === key && styles.timeSelected]}>
          <Text style={[styles.timeLabel, field === key && styles.selectedText]}>{key === 'start' ? '시작' : '종료'}</Text>
          <NumericText style={[styles.timeValue, field === key && styles.selectedText]}>{summary(key === 'start' ? start : end)}</NumericText>
        </TouchableOpacity>)}
      </View>
      {field && <View style={styles.pickerWrap}>
        <DateTimePicker key={field} testID="schedule-time-picker" value={asDate(field === 'start' ? start : end)}
          mode="time" locale="ko-KR" is24Hour={false} display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          style={styles.picker} themeVariant="light" textColor={Colors.black}
          onChange={(event, date) => {
            if (Platform.OS === 'android') setField(null);
            if (event.type === 'dismissed' || !date) return;
            if (field === 'start') setStart(toTime(date)); else setEnd(toTime(date));
          }} />
      </View>}
      <Text style={styles.bulkLabel}>다른 요일에도 적용</Text>
      <View style={styles.bulkDays}>
        {DISPLAY_DAYS.filter(i => i !== day.day_of_week).map(i => <TouchableOpacity key={i}
          accessibilityRole="checkbox" accessibilityLabel={`${WEEKDAYS[i]}요일에도 적용`} accessibilityState={{ checked: others.includes(i) }}
          onPress={() => setOthers(values => values.includes(i) ? values.filter(v => v !== i) : [...values, i])}
          style={[styles.bulkDay, others.includes(i) && styles.bulkSelected]}>
          <Text style={[styles.body, others.includes(i) && styles.selectedText]}>{WEEKDAYS[i]}</Text>
        </TouchableOpacity>)}
      </View>
    </>}
    <View style={styles.actions}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="요일 수정 취소" onPress={onCancel} style={styles.cancel}>
        <Text style={styles.body}>취소</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="요일 변경 적용" style={styles.apply}
        onPress={() => onApply({ ...day, is_working: working, start_time: working ? start : null, end_time: working ? end : null }, working ? others : [])}>
        <Text style={styles.applyText}>적용</Text>
      </TouchableOpacity>
    </View>
  </View>;
}

export default function ScheduleSettingsScreen() {
  const { day: routeDay } = useLocalSearchParams<{ day?: string | string[] }>();
  const requestedDay = typeof routeDay === 'string' && /^[0-6]$/.test(routeDay) ? Number(routeDay) : null;
  const { user, store, realRole, devPreviewMode, devPreviewEmployeeId } = useAuth();
  const { employees, loading, error, refetch } = useEmployees();
  const employee = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId);
  useEffect(() => { void refetch().catch(() => {}); }, [refetch]);
  const scope = `${user?.id ?? ''}:${store?.id ?? ''}:${employee?.id ?? ''}:${devPreviewMode}:${devPreviewEmployeeId ?? ''}:${requestedDay ?? ''}`;
  return <SafeAreaView style={styles.container}><GlassBackdrop />
    <AppBar transparent title="내 스케줄" onBack={() => router.back()} />
    {!employee ? <View style={styles.empty}>
      {loading ? <ActivityIndicator accessibilityLabel="직원 정보 불러오는 중" color={Colors.primary} />
        : <Text style={styles.note}>{error ?? '연결된 직원 정보가 없어요'}</Text>}
    </View> : <ScheduleContent key={scope} employeeId={employee.id} employeeName={employee.name} storeName={store?.name ?? ''}
      previewing={realRole === 'admin' && devPreviewMode !== 'self'} requestedDay={requestedDay} />}
  </SafeAreaView>;
}

function ScheduleContent({ employeeId, employeeName, storeName, previewing, requestedDay }: {
  employeeId: string; employeeName: string; storeName: string; previewing: boolean; requestedDay: number | null;
}) {
  const { schedule, pendingRequest, loading, submitting, refetch, submit } = useSchedule(employeeId);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(previous => {
      const next = new Date();
      return Math.floor(previous.getTime() / 60000) === Math.floor(next.getTime() / 60000) ? previous : next;
    });
    const timer = setInterval(update, 1000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') update(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);
  const [days, setDays] = useState(defaultDays);
  const [editing, setEditing] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const remaining = remainingScheduledDays(schedule, now);
  const headline = !ready || loading ? '이번 주 근무를 확인하고 있어요'
    : error ? '근무 일정을 불러오지 못했어요'
    : remaining === null ? '이번 주 근무 일정을 확인해보세요'
    : remaining > 0 ? `이번 주는 ${remaining}일 더 근무할 예정이에요`
    : '이번 주 예정된 근무를 모두 마쳤어요';
  const openedRequestedDay = useRef(false);
  const alive = useRef(true);
  const saving = useRef(false);
  const dirtyRef = useRef(false);
  const editingRef = useRef<number | null>(null);
  editingRef.current = editing;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let current = true;
    setReady(false);
    void refetch().then(() => { if (current) { setReady(true); setError(null); } })
      .catch(reason => { if (current) { setError(getErrorMessage(reason, '일정을 불러오지 못했어요')); setReady(true); } });
    return () => { current = false; };
  }, [refetch]);
  useEffect(() => {
    if (dirtyRef.current || editingRef.current !== null) return;
    setDays(defaultDays().map(base => {
      const row = schedule.find(item => item.day_of_week === base.day_of_week);
      return row ? { day_of_week: row.day_of_week, is_working: row.is_working, start_time: row.start_time, end_time: row.end_time } : base;
    }));
    if (ready && !error && requestedDay !== null && !openedRequestedDay.current) {
      openedRequestedDay.current = true;
      setEditing(requestedDay);
    }
  }, [schedule, editing, ready, error, requestedDay]);
  async function retry() {
    if (loading) return;
    try { await refetch(); if (alive.current) setError(null); }
    catch (reason) { if (alive.current) setError(getErrorMessage(reason, '일정을 불러오지 못했어요')); }
  }
  async function save() {
    if (previewing || saving.current || submitting || !ready || error || editing !== null || !dirty) return;
    saving.current = true;
    try {
      await submit(days);
      if (alive.current) Alert.alert('요청 완료', '변경한 스케줄은 사장님 승인 후 확정돼요.');
    } catch (reason) {
      if (alive.current) Alert.alert('요청 실패', getErrorMessage(reason, '잠시 후 다시 시도해주세요.'));
    } finally { saving.current = false; }
  }
  return <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
    <View style={styles.intro}>
      <Text style={styles.note}>{storeName} · {employeeName}</Text>
      <Text style={styles.title}>{headline}</Text>
    </View>
    {previewing && <Text style={styles.banner}>{employeeName}님 화면 미리보기 중이에요. 실제 제출은 본인 계정으로 로그인해야 반영돼요.</Text>}
    {pendingRequest && <Text style={styles.banner}>변경 요청 승인 대기 중이에요.</Text>}
    {!ready ? <ActivityIndicator accessibilityLabel="스케줄 불러오는 중" color={Colors.primary} />
      : error ? <View style={styles.empty}><Text style={styles.note}>{error}</Text><Button label="다시 불러오기" variant="secondary" onPress={() => { void retry(); }} /></View>
        : <>
          {schedule.length === 0 && !dirty && <Text style={styles.note}>등록된 일정이 없어요. 요일을 눌러 설정해주세요.</Text>}
          <View style={styles.heading}><Text style={styles.note}>요일별 근무</Text><Text style={styles.note}>{dirty ? '작성 중인 변경안' : '시간을 눌러 변경'}</Text></View>
          <View style={styles.list}>
            {DISPLAY_DAYS.map(i => {
              const day = days[i];
              const open = editing === i;
              return <View key={i} testID={`schedule-day-${i}`}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${WEEKDAYS[i]}요일 ${day.is_working ? `${day.start_time ? summary(day.start_time) : '시작 시간 미확인'}부터 ${day.end_time ? summary(day.end_time) : '종료 시간 미확인'}까지 근무` : '휴무'}, 일정 수정`}
                  accessibilityState={{ expanded: open, disabled: submitting }} disabled={submitting}
                  onPress={() => { if (!saving.current) setEditing(open ? null : i); }} style={[styles.row, open && styles.rowOpen]}>
                  <Text style={[styles.day, open && styles.selectedText]}>{WEEKDAYS[i]}</Text>
                  {day.is_working ? <NumericText style={styles.rowTime}>{day.start_time?.slice(0, 5) ?? '--:--'} — {day.end_time?.slice(0, 5) ?? '--:--'}</NumericText>
                    : <Text style={styles.off}>휴무</Text>}
                  <AppIcon name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={open ? Colors.action : Colors.gray500} />
                </TouchableOpacity>
                {open && <DayEditor key={i} day={day} onCancel={() => setEditing(null)} onApply={(updated, others) => {
                  if (saving.current) return;
                  const targets = new Set([i, ...others]);
                  setDays(values => values.map(value => targets.has(value.day_of_week) ? { ...updated, day_of_week: value.day_of_week } : value));
                  dirtyRef.current = true; setDirty(true); setEditing(null);
                }} />}
              </View>;
            })}
          </View>
          <Text style={styles.note}>변경한 일정은 사장님 승인 후 확정돼요.</Text>
          {(dirty || previewing) && <Button label={previewing ? '미리보기 중 (제출 불가)' : submitting ? '요청 중...' : '변경 요청하기'}
            variant="primary" onPress={save} loading={submitting} disabled={previewing || editing !== null || submitting} />}
        </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas },
  scroll: { paddingHorizontal: Spacing.screenX, paddingBottom: 40, gap: 18 },
  intro: { paddingTop: 18, paddingBottom: 8, gap: 8 },
  title: { fontSize: 22, fontWeight: '600', color: Colors.black, letterSpacing: -0.8 },
  note: { fontSize: 12, color: Colors.gray500, lineHeight: 19 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: Colors.gray200 },
  row: { minHeight: 69, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Colors.gray200 },
  rowOpen: { borderColor: Colors.taskBorder },
  day: { width: 40, fontSize: 14, fontWeight: '500', color: Colors.black },
  rowTime: { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.black },
  off: { flex: 1, fontSize: 14, color: Colors.gray500 },
  banner: { backgroundColor: Colors.bg, color: Colors.action, padding: 14, borderRadius: 12, fontSize: 12, lineHeight: 19 },
  empty: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 12 },
  editor: { paddingVertical: 16, paddingHorizontal: 8, gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Colors.gray200 },
  workRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  body: { fontSize: 14, color: Colors.gray600 },
  timeButtons: { flexDirection: 'row', gap: 8 },
  timeButton: { flex: 1, minHeight: 70, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200, borderRadius: 12, padding: 12, gap: 5 },
  timeSelected: { borderColor: Colors.primary, backgroundColor: Colors.bg },
  timeLabel: { fontSize: 12, color: Colors.gray500 },
  timeValue: { fontSize: 17, fontWeight: '500', color: Colors.black },
  selectedText: { color: Colors.action },
  pickerWrap: { width: '100%', alignItems: 'center', overflow: 'hidden' },
  picker: { width: '100%', height: 150 },
  bulkLabel: { fontSize: 12, color: Colors.gray500 },
  bulkDays: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  bulkDay: { flexGrow: 1, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  bulkSelected: { backgroundColor: Colors.bg },
  actions: { flexDirection: 'row', gap: 8 },
  cancel: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray100, borderRadius: 10 },
  apply: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.action, borderRadius: 10 },
  applyText: { fontSize: 14, color: Colors.white, fontWeight: '600' },
});
