import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch,
  Platform, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { useSchedule } from '../../lib/hooks/useSchedule';
import { ScheduleDayInput } from '../../types';
import { resolveSelfEmployee } from '../../lib/utils/resolveSelfEmployee';
import { AppBar, Button } from '../../lib/components/ui';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function defaultDays(): ScheduleDayInput[] {
  return WEEKDAYS.map((_, i) => ({ day_of_week: i, is_working: false, start_time: null, end_time: null }));
}

function toHHmmss(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
}

function fmtHHmm(t: string | null): string {
  if (!t) return '--:--';
  return t.slice(0, 5);
}

function timeToDate(t: string | null, fallbackHour: number): Date {
  const d = new Date();
  if (t) { const [h, m] = t.split(':').map(Number); d.setHours(h, m, 0, 0); }
  else d.setHours(fallbackHour, 0, 0, 0);
  return d;
}

/** 연필 아이콘으로 여는 출근/퇴근시간 한 번에 입력 폼 + 다른 요일 일괄 적용 */
function DayEditModal({
  day, onClose, onApply,
}: {
  day: ScheduleDayInput;
  onClose: () => void;
  onApply: (start: string, end: string, applyToDays: number[]) => void;
}) {
  const [startTime, setStartTime] = useState(() => timeToDate(day.start_time, 9));
  const [endTime, setEndTime] = useState(() => timeToDate(day.end_time, 18));
  const [pickerField, setPickerField] = useState<'start' | 'end' | null>(null);
  const [bulkDays, setBulkDays] = useState<Set<number>>(new Set());

  function toggleBulkDay(d: number) {
    setBulkDays(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{WEEKDAYS[day.day_of_week]}요일 근무시간</Text>

          <View style={styles.modalTimeRow}>
            <TouchableOpacity style={styles.modalTimeBtn} onPress={() => setPickerField('start')} activeOpacity={0.7}>
              <Text style={styles.modalTimeLabel}>출근</Text>
              <Text style={styles.modalTimeValue}>{fmtHHmm(toHHmmss(startTime))}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTimeSep}>~</Text>
            <TouchableOpacity style={styles.modalTimeBtn} onPress={() => setPickerField('end')} activeOpacity={0.7}>
              <Text style={styles.modalTimeLabel}>퇴근</Text>
              <Text style={styles.modalTimeValue}>{fmtHHmm(toHHmmss(endTime))}</Text>
            </TouchableOpacity>
          </View>

          {pickerField && (
            <DateTimePicker
              value={pickerField === 'start' ? startTime : endTime}
              mode="time"
              locale="ko-KR"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, value) => {
                if (Platform.OS === 'android') setPickerField(null);
                if (!value) return;
                if (pickerField === 'start') setStartTime(value); else setEndTime(value);
              }}
            />
          )}

          <Text style={styles.modalSectionLabel}>다른 요일에도 같이 적용 (선택)</Text>
          <View style={styles.bulkChipRow}>
            {WEEKDAYS.map((label, i) => i === day.day_of_week ? null : (
              <TouchableOpacity
                key={i}
                style={[styles.bulkChip, bulkDays.has(i) && styles.bulkChipActive]}
                onPress={() => toggleBulkDay(i)}
                activeOpacity={0.7}
              >
                <Text style={[styles.bulkChipText, bulkDays.has(i) && styles.bulkChipTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.modalBtnRow}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.modalCancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalApplyBtn}
              onPress={() => onApply(toHHmmss(startTime), toHHmmss(endTime), Array.from(bulkDays))}
              activeOpacity={0.7}
            >
              <Text style={styles.modalApplyText}>적용</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function ScheduleSettingsScreen() {
  const { user, realRole, devPreviewMode, devPreviewEmployeeId } = useAuth();
  const { employees, refetch: refetchEmployees } = useEmployees();
  const myEmployee = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId);
  const isPreviewing = realRole === 'admin' && devPreviewMode !== 'self';
  const { schedule, pendingRequest, loading, submitting, refetch, submit } = useSchedule(myEmployee?.id);

  useEffect(() => { refetchEmployees(); }, [refetchEmployees]);

  const [days, setDays] = useState<ScheduleDayInput[]>(defaultDays());
  const [editingDay, setEditingDay] = useState<number | null>(null);

  useEffect(() => { refetch(); }, [refetch]);

  useEffect(() => {
    if (schedule.length === 0) return;
    setDays(defaultDays().map(base => {
      const row = schedule.find(s => s.day_of_week === base.day_of_week);
      return row
        ? { day_of_week: row.day_of_week, is_working: row.is_working, start_time: row.start_time, end_time: row.end_time }
        : base;
    }));
  }, [schedule]);

  function toggleDay(day: number) {
    setDays(prev => prev.map(d => d.day_of_week === day
      ? { ...d, is_working: !d.is_working, start_time: d.is_working ? d.start_time : (d.start_time ?? '09:00:00'), end_time: d.is_working ? d.end_time : (d.end_time ?? '18:00:00') }
      : d));
  }

  function applyDayEdit(start: string, end: string, applyToDays: number[]) {
    if (editingDay == null) return;
    const targets = new Set([editingDay, ...applyToDays]);
    setDays(prev => prev.map(d => targets.has(d.day_of_week)
      ? { ...d, is_working: true, start_time: start, end_time: end }
      : d));
    setEditingDay(null);
  }

  async function handleSave() {
    if (!myEmployee) return;
    try {
      await submit(days);
      Alert.alert('요청 완료', '변경한 스케줄은 사장님 승인 후 확정돼요.');
    } catch (e: any) {
      Alert.alert('요청 실패', e.message ?? '잠시 후 다시 시도해주세요.');
    }
  }

  if (!myEmployee) {
    return (
      <SafeAreaView style={styles.container}>
        <AppBar title="스케줄 설정" onBack={() => router.back()} />
        <View style={styles.empty}><Text style={styles.emptyText}>연결된 직원 정보가 없어요</Text></View>
      </SafeAreaView>
    );
  }

  const editingDayData = days.find(d => d.day_of_week === editingDay);

  return (
    <SafeAreaView style={styles.container}>
      <AppBar title="스케줄 설정" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
        ) : (
          <>
            {isPreviewing && (
              <View style={styles.pendingBanner}>
                <Ionicons name="eye-outline" size={16} color={Colors.warningStroke} />
                <Text style={styles.pendingBannerText}>{myEmployee?.name}님 화면 미리보기 중이에요. 실제 제출은 본인 계정으로 로그인해야 반영돼요.</Text>
              </View>
            )}
            {pendingRequest && (
              <View style={styles.pendingBanner}>
                <Ionicons name="time-outline" size={16} color={Colors.warningStroke} />
                <Text style={styles.pendingBannerText}>이전에 제출한 변경 요청이 사장님 승인을 기다리고 있어요</Text>
              </View>
            )}

            {days.map(d => (
              <View key={d.day_of_week} style={[styles.dayRow, d.is_working ? styles.dayRowActive : styles.dayRowInactive]}>
                <Text style={styles.dayLabel}>{WEEKDAYS[d.day_of_week]}</Text>
                {d.is_working ? (
                  <TouchableOpacity style={styles.timeGroup} onPress={() => setEditingDay(d.day_of_week)} activeOpacity={0.7}>
                    <Text style={styles.timeText}>{fmtHHmm(d.start_time)} ~ {fmtHHmm(d.end_time)}</Text>
                    <Ionicons name="pencil" size={13} color={Colors.gray400} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.offText}>휴무</Text>
                )}
                <Switch
                  value={d.is_working}
                  onValueChange={() => toggleDay(d.day_of_week)}
                  trackColor={{ false: Colors.gray200, true: Colors.primary }}
                  thumbColor={Colors.white}
                />
              </View>
            ))}

            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.gray500} />
              <Text style={styles.infoText}>변경한 스케줄은 사장님 승인 후 확정돼요</Text>
            </View>

            <Button
              label={submitting ? '요청 중...' : isPreviewing ? '미리보기 중 (제출 불가)' : '스케줄 저장하기'}
              variant="primary" onPress={handleSave} loading={submitting} disabled={isPreviewing}
            />
          </>
        )}
      </ScrollView>

      {editingDayData && (
        <DayEditModal
          day={editingDayData}
          onClose={() => setEditingDay(null)}
          onApply={applyDayEdit}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  scroll: { padding: Spacing.screenX, paddingBottom: 40, gap: 10 },

  pendingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.warningBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
  },
  pendingBannerText: { flex: 1, fontSize: 12, fontWeight: '500', color: Colors.warningStroke },

  dayRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
  },
  dayRowActive: { borderWidth: 1, borderColor: Colors.primary, backgroundColor: Colors.tinted },
  dayRowInactive: { borderWidth: 1, borderColor: Colors.gray100, backgroundColor: Colors.white },
  dayLabel: { width: 24, fontSize: 14, fontWeight: '700', color: Colors.black },
  timeGroup: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  timeText: { fontSize: 14, fontWeight: '600', color: Colors.black },
  offText: { flex: 1, fontSize: 14, fontWeight: '500', color: Colors.gray400 },

  infoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.gray50, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
  },
  infoText: { flex: 1, fontSize: 12, fontWeight: '400', color: Colors.gray500 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, color: Colors.gray400 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: Colors.white, borderRadius: 20, padding: 20, gap: 14 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.black },
  modalTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalTimeBtn: {
    flex: 1, borderWidth: 1, borderColor: Colors.primary, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, gap: 3,
  },
  modalTimeLabel: { fontSize: 11, fontWeight: '600', color: Colors.gray400 },
  modalTimeValue: { fontSize: 16, fontWeight: '700', color: Colors.black },
  modalTimeSep: { fontSize: 13, color: Colors.gray400 },

  modalSectionLabel: { fontSize: 12, fontWeight: '700', color: Colors.gray600, marginTop: 4 },
  bulkChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bulkChip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray200 },
  bulkChipActive: { backgroundColor: Colors.black, borderColor: Colors.black },
  bulkChipText: { fontSize: 12, fontWeight: '600', color: Colors.gray600 },
  bulkChipTextActive: { color: Colors.white },

  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalCancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray200 },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: Colors.gray500 },
  modalApplyBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.primary },
  modalApplyText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
