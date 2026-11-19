/** Native-only design harness. No Auth, network, QR signing, or database imports. */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { Radius, Spacing, Type } from '../../constants/designTokens';
import { GlassBackdrop } from '../../lib/components/GlassBackdrop';

const original = new Date(2026, 10, 17, 9, 2);
export function dateLabel(date: Date) {
  return `${date.getFullYear() === original.getFullYear() ? '' : `${date.getFullYear()}년 `}${date.getMonth() + 1}월 ${date.getDate()}일`;
}
export function timeLabel(date: Date) {
  return `${date.getHours() < 12 ? '오전' : '오후'} ${date.getHours() % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function AttendanceDesign() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState(new Date(original));
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(false);
  const [reduced, setReduced] = useState(false);
  const translate = useRef(new Animated.Value(height)).current;
  const closing = useRef(false);
  const alive = useRef(true);
  const closeRef = useRef(() => {});
  useEffect(() => {
    alive.current = true;
    let changed = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(enabled => { if (alive.current && !changed) setReduced(enabled); }).catch(() => { if (alive.current && !changed) setReduced(true); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', enabled => { changed = true; setReduced(enabled); });
    return () => { alive.current = false; subscription.remove(); translate.stopAnimation(); };
  }, [translate]);
  function open() {
    if (visible || closing.current) return;
    translate.setValue(height); setVisible(true); setResult(false); setError('');
  }
  function close() {
    if (closing.current) return;
    closing.current = true; Keyboard.dismiss();
    Animated.timing(translate, { toValue: height, duration: reduced ? 0 : 250, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (!alive.current) return;
      if (finished) { setVisible(false); setPicker(null); }
      closing.current = false;
    });
  }
  closeRef.current = close;
  const reducedRef = useRef(reduced); reducedRef.current = reduced;
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !closing.current && g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => { translate.stopAnimation(); },
    onPanResponderMove: (_, g) => { if (!closing.current) translate.setValue(Math.max(0, g.dy)); },
    onPanResponderRelease: (_, g) => {
      if (closing.current) return;
      if (g.dy > 100 || (g.dy > 24 && g.vy > .6)) closeRef.current();
      else Animated.timing(translate, { toValue: 0, duration: reducedRef.current ? 0 : 180, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => { if (!closing.current) Animated.timing(translate, { toValue: 0, duration: reducedRef.current ? 0 : 180, useNativeDriver: true }).start(); },
  })).current;
  function updateDate(next: Date, field: 'date' | 'time') {
    setValue(current => {
      const copy = new Date(current);
      if (field === 'date') copy.setFullYear(next.getFullYear(), next.getMonth(), next.getDate());
      else copy.setHours(next.getHours(), next.getMinutes(), 0, 0);
      return copy;
    });
    setError(''); setResult(false);
  }
  function submit() {
    Keyboard.dismiss();
    if (!reason.trim()) { setError('기록 정정 사유를 적어주세요'); return; }
    setError(''); setResult(true);
  }
  return <SafeAreaView style={s.root}>
    <GlassBackdrop />
    <Text style={s.preview}>디자인 미리보기 · 가상 기록</Text>
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>내 출퇴근 QR</Text><Text style={s.note}>래틀</Text>
      <View style={s.records}>
        <Text style={s.label}>오늘 내 기록</Text>
        <View style={s.row}><Text style={s.body}>출근</Text><Text style={s.number}>{timeLabel(original)}</Text></View>
        <View style={s.row}><Text style={s.body}>퇴근</Text><Text style={s.note}>아직 기록이 없어요</Text></View>
      </View>
      <View style={s.qrArea}>
        <View style={s.qr} accessible accessibilityLabel="스캔되지 않는 QR 자리 표시">
          <Svg width={132} height={132} viewBox="0 0 100 100">
            <Rect x={6} y={6} width={28} height={28} rx={3} stroke={Colors.black} strokeWidth={5} fill="none" />
            <Rect x={66} y={6} width={28} height={28} rx={3} stroke={Colors.black} strokeWidth={5} fill="none" />
            <Rect x={6} y={66} width={28} height={28} rx={3} stroke={Colors.black} strokeWidth={5} fill="none" />
            <Path d="M52 8v28M44 50h20v16h30M52 82v12M70 82h24M12 50h20" stroke={Colors.black} strokeWidth={5} fill="none" />
          </Svg><Text style={s.label}>QR 미리보기</Text>
        </View>
        <Text style={s.subtitle}>매장폰에 QR을 보여주세요</Text><Text style={s.note}>출근·퇴근은 자동으로 기록돼요</Text>
      </View>
      <Pressable style={s.menu} accessibilityRole="button" onPress={open}><Text style={s.body}>기록 정정 요청</Text><Text style={s.note}>›</Text></Pressable>
    </ScrollView>
    <Modal visible={visible} transparent animationType="none" onRequestClose={close} statusBarTranslucent onShow={() => {
      Animated.timing(translate, { toValue: 0, duration: reduced ? 0 : 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }}>
      <View style={s.modalRoot} accessibilityViewIsModal onAccessibilityEscape={close}>
        <Animated.View style={[s.sheet, { marginTop: insets.top, transform: [{ translateY: translate }] }]}>
          <GlassBackdrop />
          <View {...pan.panHandlers}>
            <Pressable style={s.grabTarget} onPress={close} accessibilityRole="button" accessibilityLabel="정정 요청 닫기" accessibilityHint="아래로 쓸어내려 닫을 수도 있어요"><View style={s.grab} /></Pressable>
            <View style={s.heading}><Text style={s.title}>기록 정정 요청</Text><Text style={s.note}>관리자가 확인하면 기록에 반영돼요</Text></View>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top} style={s.flex}>
            <ScrollView contentContainerStyle={[s.form, { paddingBottom: Math.max(insets.bottom, 24) }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              <View style={s.original}><Text style={s.label}>기존 출근 기록</Text><Text style={s.originalValue}>{dateLabel(original)} · {timeLabel(original)}</Text></View>
              <View style={s.fields}>
                {(['date', 'time'] as const).map(field => <View key={field} style={s.field}>
                  <Text style={s.label}>변경할 {field === 'date' ? '날짜' : '시간'}</Text>
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: picker === field }} accessibilityLabel={`변경할 ${field === 'date' ? '날짜' : '시간'} ${field === 'date' ? dateLabel(value) : timeLabel(value)}`} onPress={() => setPicker(picker === field ? null : field)} style={[s.inputButton, picker === field && s.selected]}>
                    <Text style={[s.body, picker === field && s.selectedText]}>{field === 'date' ? dateLabel(value) : timeLabel(value)}</Text><Text style={s.note}>⌄</Text>
                  </Pressable>
                </View>)}
              </View>
              {picker && <DateTimePicker testID="attendance-design-picker" value={value} mode={picker} display={Platform.OS === 'ios' ? (picker === 'time' ? 'spinner' : 'inline') : 'default'} locale="ko-KR" is24Hour={false} themeVariant="light" textColor={Colors.black} style={s.picker} onChange={(event, date) => {
                if (event.type !== 'dismissed' && date) updateDate(date, picker);
                if (Platform.OS !== 'ios') setPicker(null);
              }} />}
              <Text style={s.label}>기록 정정 사유</Text>
              <TextInput accessibilityLabel="기록 정정 사유" placeholder="정정이 필요한 이유를 알려주세요" placeholderTextColor={Colors.gray500} value={reason} onChangeText={text => { setReason(text); setError(''); setResult(false); }} multiline maxLength={500} style={s.reason} textAlignVertical="top" />
              {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
              {result && <Text accessibilityLiveRegion="polite" style={s.note}>디자인 미리보기예요. 실제 요청은 전송되지 않아요.</Text>}
              <View style={s.actions}>
                <Pressable onPress={close} accessibilityRole="button" style={s.cancel}><Text style={s.selectedText}>취소</Text></Pressable>
                <Pressable onPress={submit} accessibilityRole="button" style={s.submit}><Text style={s.submitText}>정정 요청</Text></Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.homeCanvas }, flex: { flex: 1 },
  preview: { fontFamily: Fonts.wantedRegular, fontSize: Type.sm, color: Colors.gray600, textAlign: 'center', padding: 8 },
  content: { padding: Spacing.screenX, paddingBottom: 40 }, title: { fontFamily: Fonts.wantedSemiBold, fontSize: 22, color: Colors.black, marginBottom: 8 },
  subtitle: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.lg, color: Colors.black, marginBottom: 8 },
  body: { fontFamily: Fonts.wantedRegular, fontSize: Type.md, color: Colors.black },
  note: { fontFamily: Fonts.wantedRegular, fontSize: Type.base, color: Colors.gray600, lineHeight: 22 },
  label: { fontFamily: Fonts.wantedRegular, fontSize: Type.sm, color: Colors.gray600 },
  number: { fontFamily: Fonts.geistMedium, fontSize: 18, color: Colors.black },
  records: { marginTop: 28, borderBottomWidth: 1, borderColor: Colors.homeBorder, paddingBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56 },
  qrArea: { alignItems: 'center', paddingVertical: 24 },
  qr: { width: 220, height: 220, backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder, justifyContent: 'center', alignItems: 'center', gap: 16, marginBottom: 20 },
  menu: { minHeight: 52, borderTopWidth: 1, borderColor: Colors.homeBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalRoot: { flex: 1, backgroundColor: Colors.overlayDetail },
  sheet: { flex: 1, borderTopLeftRadius: Radius.pill, borderTopRightRadius: Radius.pill, overflow: 'hidden', backgroundColor: Colors.homeCanvas },
  grabTarget: { height: 44, alignItems: 'center', justifyContent: 'center' }, grab: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.gray400 },
  heading: { paddingHorizontal: Spacing.screenX, paddingTop: 8, paddingBottom: 10 },
  form: { paddingHorizontal: Spacing.screenX }, original: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderColor: Colors.homeBorder, marginBottom: 20 },
  originalValue: { fontFamily: Fonts.wantedRegular, fontSize: Type.base, color: Colors.black, textAlign: 'right', maxWidth: '68%' },
  fields: { flexDirection: 'row', gap: 10, marginBottom: 24 }, field: { flex: 1, minWidth: 0, gap: 10 },
  inputButton: { backgroundColor: Colors.white, borderRadius: Radius.field, minHeight: 48, borderWidth: 1, borderColor: Colors.homeBorder, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  selected: { borderColor: Colors.action }, selectedText: { fontFamily: Fonts.wantedMedium, fontSize: Type.md, color: Colors.action },
  picker: { alignSelf: 'stretch', marginBottom: 24 },
  reason: { fontFamily: Fonts.wantedRegular, fontSize: Type.md, color: Colors.black, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.homeBorder, borderRadius: Radius.field, minHeight: 100, padding: 12, marginTop: 10, marginBottom: 16 },
  error: { fontFamily: Fonts.wantedRegular, fontSize: Type.sm, color: Colors.danger, marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancel: { flex: 1, backgroundColor: Colors.bg, minHeight: 48, borderRadius: Radius.field, alignItems: 'center', justifyContent: 'center' },
  submit: { flex: 2, backgroundColor: Colors.action, minHeight: 48, borderRadius: Radius.field, alignItems: 'center', justifyContent: 'center' },
  submitText: { fontFamily: Fonts.wantedMedium, fontSize: Type.md, color: Colors.white },
});
