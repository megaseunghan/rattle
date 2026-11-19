import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { CardStyle, Radius, Spacing, Type } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { useAttendanceToday } from '../../lib/hooks/useAttendanceToday';
import { useAttendanceCorrections } from '../../lib/hooks/useAttendanceCorrections';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';
import { resolveSelfEmployee } from '../../lib/utils/resolveSelfEmployee';
import { AppBar } from '../../lib/components/ui';
import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';

export default function AttendanceCorrectionScreen() {
  const { user, store, devPreviewMode, devPreviewEmployeeId, storeRole } = useAuth();
  const employees = useEmployees(); const employee = resolveSelfEmployee(employees.employees, user?.id, devPreviewEmployeeId);
  const record = useAttendanceToday(employee?.id); const requests = useAttendanceCorrections(employee?.id);
  const [kind, setKind] = useState<'clock_in' | 'clock_out'>('clock_in');
  const [value, setValue] = useState(new Date()); const [reason, setReason] = useState(''); const [error, setError] = useState('');
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const target = kind === 'clock_in' ? record.start : record.end;
  const locked = ['saving', 'unknown', 'saved'].includes(requests.outcome);
  useConfirmLeave(!!reason.trim() && requests.outcome !== 'saved' || requests.outcome === 'saving', { blockLeave: requests.outcome === 'saving' });
  useEffect(() => { setReason(''); setError(''); setValue(new Date()); }, [store?.id, user?.id, employee?.id, devPreviewMode]);
  useEffect(() => { if (target) setValue(new Date(target.punched_at)); }, [target?.id]);
  const dateText = value.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });
  async function submit() {
    if (locked || record.loading || record.error) return;
    if (!employee || devPreviewMode !== 'self') { setError('사장님에게 직원 등록 상태를 확인해주세요'); return; }
    if (!target) { setError('정정할 기록을 다시 선택해주세요'); return; }
    if (!reason.trim()) { setError('기록 정정 사유를 적어주세요'); return; }
    if (reason.trim().length > 500) { setError('사유는 500자 이내로 적어주세요'); return; }
    if (Date.now() - value.getTime() > 366 * 86400000 || value.getTime() > Date.now() + 300000) { setError('날짜와 시간을 확인해주세요'); return; }
    if (kind === 'clock_in' && record.end && value.getTime() >= Date.parse(record.end.punched_at) || kind === 'clock_out' && record.start && value.getTime() <= Date.parse(record.start.punched_at)) { setError('출근 시간이 퇴근 시간보다 늦어요. 날짜와 시간을 확인해주세요'); return; }
    setError(''); await requests.submit({ p_action: 'change', p_target_punch_id: target.id, p_kind: kind, p_time: value.toISOString(), p_reason: reason.trim() });
  }
  return <SafeAreaView style={s.root}><GlassBackdrop /><AppBar transparent title="기록 정정 요청" onBack={() => router.back()} />
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <Text style={s.note}>{storeRole === 'manager' ? '사장님이 확인하면 기록이 바뀌어요' : '사장님이나 점장님이 확인하면 기록이 바뀌어요'}</Text>
        <View style={s.choices}>{(['clock_in', 'clock_out'] as const).map(item => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ selected: kind === item, disabled: locked }} disabled={locked} style={[s.choice, kind === item && s.selected]} onPress={() => setKind(item)}><Text style={s.label}>{item === 'clock_in' ? '출근' : '퇴근'}</Text></Pressable>)}</View>
        <Text style={s.label}>바꿀 시각</Text>
        <Pressable accessibilityRole="button" disabled={locked} onPress={() => setPicker('date')} style={s.field}><Text style={s.label}>{dateText}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={locked} onPress={() => setPicker('time')} style={s.field}><Text style={s.number}>{value.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}</Text></Pressable>
        {picker && !locked && <DateTimePicker value={value} mode={picker} display="spinner" locale="ko-KR" timeZoneName="Asia/Seoul" onChange={(_, next) => { if (next) setValue(next); if (Platform.OS !== 'ios') setPicker(null); }} />}
        {picker && <Pressable accessibilityRole="button" style={s.choice} onPress={() => setPicker(null)}><Text style={s.link}>닫기</Text></Pressable>}
        <Text style={s.label}>정정 사유</Text><TextInput accessibilityLabel="정정 사유" editable={!locked} value={reason} onChangeText={setReason} multiline maxLength={500} style={[s.field, s.reason]} placeholder="실제 기록과 다른 이유를 적어주세요" placeholderTextColor={Colors.gray500} />
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        {requests.outcome === 'saving' && <LoadingSpinner fullScreen={false} />}
        {!!requests.outcome && requests.outcome !== 'saving' && <Text accessibilityLiveRegion="polite" style={s.note}>{requests.outcome === 'saved' ? '정정을 요청했어요' : requests.outcome === 'unknown' ? '저장됐는지 확인하고 있어요. 요청한 기록을 확인해주세요' : '요청하지 못했어요. 잠시 후 다시 시도해주세요'}</Text>}
        {requests.outcome === 'unknown' || requests.outcome === 'saved' ? <Pressable style={s.button} accessibilityRole="button" onPress={() => router.push('/attendance/corrections')}><Text style={s.buttonText}>기록 보기</Text></Pressable> : <Pressable style={s.button} disabled={locked} accessibilityRole="button" accessibilityState={{ disabled: locked }} onPress={() => { void submit(); }}><Text style={s.buttonText}>정정 요청하기</Text></Pressable>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const s = StyleSheet.create({ root: { flex: 1, backgroundColor: Colors.homeCanvas }, flex: { flex: 1 }, content: { padding: Spacing.screenX, gap: 14, paddingBottom: 40 },
  note: { fontFamily: Fonts.wantedRegular, fontSize: Type.base, lineHeight: 22, color: Colors.gray600 }, label: { fontFamily: Fonts.wantedMedium, fontSize: Type.base, color: Colors.black },
  choices: { flexDirection: 'row', gap: 10 }, choice: { minHeight: 44, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.field }, selected: { backgroundColor: Colors.tinted },
  field: { ...CardStyle, borderRadius: Radius.field, padding: 14, minHeight: 52, justifyContent: 'center' }, number: { fontFamily: Fonts.geistMedium, fontSize: Type.lg, color: Colors.black }, reason: { minHeight: 100, textAlignVertical: 'top', fontFamily: Fonts.wantedRegular, fontSize: Type.base, color: Colors.black },
  error: { fontFamily: Fonts.wantedRegular, fontSize: Type.base, color: Colors.danger }, link: { color: Colors.action, fontSize: Type.base }, button: { backgroundColor: Colors.action, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.field }, buttonText: { fontFamily: Fonts.wantedMedium, fontSize: Type.base, color: Colors.white }, });
