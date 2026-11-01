import { NumericText } from '../../lib/components/ui/NumericText';
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AppIcon } from '../../lib/icons/AppIcon';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { Spacing } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { getManualSaleByDate, saveManualSale } from '../../lib/services/manualSales';
import { getErrorMessage } from '../../lib/utils/error';
import { ManualSale } from '../../types';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { AppBar, Button } from '../../lib/components/ui';

function formatDate(d: Date): string {
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function onlyDigits(t: string): string {
  return t.replace(/[^0-9]/g, '');
}

function toNum(t: string): number {
  return Number(t) || 0;
}

function fmtWon(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`;
}

/** 화면 11 · 매출 추가 — 현금/카드를 동시에 입력하고 할인액(선택)까지 기록하는 수기 매출 폼 */
export default function ManualSaleNewScreen() {
  const { store } = useAuth();
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [cardAmount, setCardAmount] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const memoFocused = useRef(false);

  const cashNum = toNum(cashAmount);
  const cardNum = toNum(cardAmount);
  const discountNum = toNum(discountAmount);
  const total = cashNum + cardNum;

  const dateKey = toDateKey(date);
  const scope = `${store?.id ?? ''}:${dateKey}`;
  const active = useRef(scope); active.current = scope;
  useEffect(() => () => { active.current = ''; }, []);
  const [loaded, setLoaded] = useState<{ scope: string; row: ManualSale | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const navigationPrompt = useRef(false);
  const ready = loaded?.scope === scope && !loading && !loadError;
  const previous = ready ? loaded.row : null;
  const dirty = !!ready && (cashNum !== Number(previous?.cash_amount ?? 0) || cardNum !== Number(previous?.card_amount ?? 0)
    || discountNum !== Number(previous?.discount_amount ?? 0) || memo !== (previous?.memo ?? ''));
  const busy = saving || reviewing;
  const bypassLeave = useConfirmLeave(dirty || busy, { blockLeave: busy });

  useEffect(() => {
    let cancelled = false;
    generation.current += 1;
    lock.current = false; navigationPrompt.current = false;
    setSaving(false); setReviewing(false);
    setLoading(true); setLoadError(null); setLoaded(null);
    setCashAmount(''); setCardAmount(''); setDiscountAmount(''); setMemo('');
    if (!store) { setLoading(false); return; }
    getManualSaleByDate(store.id, dateKey).then(row => {
      if (cancelled) return;
      setLoaded({ scope, row });
      setCashAmount(row ? String(row.cash_amount) : '');
      setCardAmount(row ? String(row.card_amount) : '');
      setDiscountAmount(row ? String(row.discount_amount) : '');
      setMemo(row?.memo ?? '');
    }).catch(e => { if (!cancelled) setLoadError(getErrorMessage(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scope, reload]);

  function discardThen(action: () => void) {
    if (busy || navigationPrompt.current) return;
    if (dirty) {
      navigationPrompt.current = true;
      const captured = scope;
      const capturedGeneration = generation.current;
      Alert.alert('작성 내용을 버릴까요?', '저장하지 않은 변경 내용은 사라져요.', [
        { text: '계속 작성', style: 'cancel', onPress: () => { navigationPrompt.current = false; setShowDatePicker(false); } },
        { text: '불러오기', onPress: () => { navigationPrompt.current = false; if (active.current === captured && generation.current === capturedGeneration) action(); } },
      ], { cancelable: false });
    } else action();
  }

  function handleSave() {
    if (!store || !ready || lock.current) return;
    if (![cashNum, cardNum, discountNum].every(n => Number.isSafeInteger(n) && n >= 0 && n < 1e12)) { Alert.alert('입력 오류', '금액은 1조 원 미만의 0 이상 정수로 입력해주세요.'); return; }
    if (total <= 0) { Alert.alert('입력 오류', '현금 또는 카드 매출액을 입력해주세요.'); return; }
    const input = { storeId: store.id, date: dateKey, cashAmount: cashNum, cardAmount: cardNum, discountAmount: discountNum, memo: memo.trim() || null, expected: previous };
    const capturedScope = scope;
    const capturedGeneration = generation.current;
    const isCurrent = () => active.current === capturedScope && generation.current === capturedGeneration;
    const lines = [
      `현금: ${fmtWon(Number(previous?.cash_amount ?? 0))} → ${fmtWon(cashNum)}`,
      `카드: ${fmtWon(Number(previous?.card_amount ?? 0))} → ${fmtWon(cardNum)}`,
      `할인: ${fmtWon(Number(previous?.discount_amount ?? 0))} → ${fmtWon(discountNum)}`,
      `메모: ${previous?.memo || '없음'} → ${input.memo || '없음'}`,
    ];
    lock.current = true; setReviewing(true);
    let reviewHandled = false;
    const cancel = () => { reviewHandled = true; if (isCurrent()) { lock.current = false; setReviewing(false); } };
    Alert.alert(previous ? '매출 변경 확인' : '매출 등록 확인', `${formatDate(date)}\n${lines.join('\n')}\n할인은 현금·카드 매출에서 다시 차감하지 않아요.`, [
      { text: '취소', style: 'cancel', onPress: cancel },
      { text: '저장', onPress: async () => {
        if (reviewHandled) return;
        reviewHandled = true;
        if (!isCurrent()) { cancel(); return; }
        setReviewing(false); setSaving(true);
        try {
          const saved = await saveManualSale(input);
          if (!isCurrent()) return;
          setLoaded({ scope: capturedScope, row: saved });
          setMemo(saved.memo ?? '');
          Alert.alert('저장 완료', saved.cacheRefreshFailed ? '매출은 저장됐어요. 목록을 다시 불러와 확인해주세요.' : '매출이 저장됐어요.', [
            { text: '확인', onPress: () => { if (isCurrent()) { bypassLeave(); router.back(); } } },
          ]);
        } catch (e) { if (isCurrent()) Alert.alert('저장 확인 필요', getErrorMessage(e)); }
        finally { if (isCurrent()) { lock.current = false; setSaving(false); } }
      } },
    ], { cancelable: false });
  }

  return (
    <SafeAreaView style={styles.container}>
      <AppBar title={previous ? "매출 수정" : "매출 추가"} onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scrollRef} onLayout={() => { if (memoFocused.current) scrollRef.current?.scrollToEnd({ animated: true }); }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text style={styles.label}>날짜</Text>
        <TouchableOpacity style={styles.dateInput} accessibilityRole="button" accessibilityLabel={`매출 날짜 ${formatDate(date)} 변경`} accessibilityState={{ expanded: showDatePicker }} disabled={busy} onPress={() => setShowDatePicker(v => !v)} activeOpacity={0.7}>
          <Text style={styles.dateText}>{formatDate(date)}</Text>
          <AppIcon name="calendar-outline" size={18} color={Colors.gray500} />
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            locale="ko-KR"
            maximumDate={new Date()}
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(_, d) => {
              if (Platform.OS === 'android') setShowDatePicker(false);
              if (d && toDateKey(d) !== dateKey) discardThen(() => { setDate(d); setShowDatePicker(false); });
            }}
          />
        )}
        <Text style={styles.hint}>{!ready ? (loadError ? '저장된 매출을 불러오지 못했어요.' : '저장된 매출을 확인하고 있어요.') : previous ? '저장된 일 합계를 불러왔어요. 변경 전후를 확인하고 저장해 주세요.' : '새 날짜의 일 합계를 등록해요.'}</Text>
        {loadError && <ErrorMessage message={loadError} onRetry={() => setReload(n => n + 1)} />}
        {ready && <Button label="저장된 값 다시 불러오기" variant="text" disabled={busy} onPress={() => discardThen(() => setReload(n => n + 1))} />}

        <Text style={styles.label}>현금 매출</Text>
        <View style={styles.amountRow}>
          <AppIcon name="cash-outline" size={16} color={Colors.gray500} />
          <TextInput
            style={styles.amountInput}
            editable={!!ready && !busy}
            value={ready ? cashAmount : ''}
            accessibilityLabel="현금 매출, 원"
            onChangeText={t => setCashAmount(onlyDigits(t))}
            placeholder="0"
            placeholderTextColor={Colors.gray300}
            keyboardType="number-pad"
          />
          <Text style={styles.amountUnit}>원</Text>
        </View>

        <Text style={styles.label}>카드 매출</Text>
        <View style={styles.amountRow}>
          <AppIcon name="card-outline" size={16} color={Colors.gray500} />
          <TextInput
            style={styles.amountInput}
            editable={!!ready && !busy}
            value={ready ? cardAmount : ''}
            accessibilityLabel="카드 매출, 원"
            onChangeText={t => setCardAmount(onlyDigits(t))}
            placeholder="0"
            placeholderTextColor={Colors.gray300}
            keyboardType="number-pad"
          />
          <Text style={styles.amountUnit}>원</Text>
        </View>

        <Text style={styles.label}>오늘 할인액 (선택)</Text>
        <View style={styles.amountRow}>
          <AppIcon name="pricetag-outline" size={16} color={Colors.gray500} />
          <TextInput
            style={styles.amountInput}
            editable={!!ready && !busy}
            value={ready ? discountAmount : ''}
            accessibilityLabel="오늘 할인액, 원, 선택"
            onChangeText={t => setDiscountAmount(onlyDigits(t))}
            placeholder="0"
            placeholderTextColor={Colors.gray300}
            keyboardType="number-pad"
          />
          <Text style={styles.amountUnit}>원</Text>
        </View>

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>총 매출</Text>
          <NumericText style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{ready ? fmtWon(total) : loadError ? '확인 필요' : '확인 중...'}</NumericText>
          {ready && discountNum > 0 && (
            <Text style={styles.totalSub}>할인 {fmtWon(discountNum)} 포함 · 할인 전 {fmtWon(total + discountNum)}</Text>
          )}
        </View>

        <Text style={styles.label}>메모 (선택)</Text>
        <TextInput
          style={styles.memoInput}
          editable={!!ready && !busy}
          value={ready ? memo : ''}
          accessibilityLabel="메모, 선택"
          onFocus={() => { memoFocused.current = true; scrollRef.current?.scrollToEnd({ animated: true }); }}
          onBlur={() => { memoFocused.current = false; }}
          onChangeText={setMemo}
          placeholder="예: POS 미연동 매장 수기 마감"
          placeholderTextColor={Colors.gray400}
          multiline
        />

      </ScrollView>
      <View style={styles.footer}>
        <Button label={previous ? '변경 내용 확인' : '등록 내용 확인'} disabled={!ready || busy || (!!previous && !dirty)} variant="primary" onPress={handleSave} loading={saving} />
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas},
  scroll: { padding: Spacing.screenX, paddingBottom: 40, gap: 10 },
  footer: { paddingHorizontal: Spacing.screenX, paddingVertical: 12, backgroundColor: Colors.homeCanvas },

  label: { fontSize: 13, fontWeight: '700', color: Colors.gray600, marginTop: 6 },
  hint: { fontSize: 13, fontWeight: '400', color: Colors.gray500, marginTop: -4, lineHeight: 19 },

  dateInput: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: Colors.homeBorder, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, backgroundColor: Colors.white, minHeight: 44 },
  dateText: { fontVariant: ['tabular-nums'], flex: 1, fontSize: 14, fontWeight: '600', color: Colors.black },

  amountRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: Colors.homeBorder, borderRadius: 12,
    paddingHorizontal: 14, backgroundColor: Colors.white,
  },
  amountInput: { fontVariant: ['tabular-nums'], flex: 1, fontSize: 18, fontWeight: '700', color: Colors.black, paddingVertical: 13 },
  amountUnit: { fontSize: 14, fontWeight: '600', color: Colors.gray400 },

  totalCard: {
    backgroundColor: Colors.white, borderRadius: 24, padding: 20, gap: 6, marginTop: 4, borderWidth: 1, borderColor: Colors.homeBorder },
  totalLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  totalValue: { fontFamily: Fonts.spaceGroteskBold, fontSize: 24, fontWeight: '700', color: Colors.black, letterSpacing: -0.5 },
  totalSub: { fontVariant: ['tabular-nums'], fontSize: 13, fontWeight: '500', color: Colors.gray500 },

  memoInput: {
    minHeight: 64, borderWidth: 1, borderColor: Colors.homeBorder, borderRadius: 12,
    padding: 12, fontSize: 14, color: Colors.black, backgroundColor: Colors.white,
    textAlignVertical: 'top',
  },
});
