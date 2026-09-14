import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { saveManualSale } from '../../lib/services/manualSales';
import { getErrorMessage } from '../../lib/utils/error';
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

  const cashNum = toNum(cashAmount);
  const cardNum = toNum(cardAmount);
  const discountNum = toNum(discountAmount);
  const total = cashNum + cardNum;

  async function handleSave() {
    if (!store) return;
    if (total <= 0) {
      Alert.alert('입력 오류', '현금 또는 카드 매출액을 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      await saveManualSale({
        storeId: store.id,
        date: toDateKey(date),
        cashAmount: cashNum,
        cardAmount: cardNum,
        discountAmount: discountNum,
        memo: memo.trim() || null,
      });
      Alert.alert('등록 완료', '매출이 등록됐어요.', [{ text: '확인', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('등록 실패', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <AppBar title="매출 추가" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>날짜</Text>
        <TouchableOpacity style={styles.dateInput} onPress={() => setShowDatePicker(v => !v)} activeOpacity={0.7}>
          <Text style={styles.dateText}>{formatDate(date)}</Text>
          <Ionicons name="calendar-outline" size={18} color={Colors.gray500} />
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
              if (d) setDate(d);
            }}
          />
        )}
        <Text style={styles.hint}>같은 날짜로 다시 등록하면 그날 값이 수정돼요</Text>

        <Text style={styles.label}>현금 매출</Text>
        <View style={styles.amountRow}>
          <Ionicons name="cash-outline" size={16} color={Colors.gray500} />
          <TextInput
            style={styles.amountInput}
            value={cashAmount}
            onChangeText={t => setCashAmount(onlyDigits(t))}
            placeholder="0"
            placeholderTextColor={Colors.gray300}
            keyboardType="number-pad"
          />
          <Text style={styles.amountUnit}>원</Text>
        </View>

        <Text style={styles.label}>카드 매출</Text>
        <View style={styles.amountRow}>
          <Ionicons name="card-outline" size={16} color={Colors.gray500} />
          <TextInput
            style={styles.amountInput}
            value={cardAmount}
            onChangeText={t => setCardAmount(onlyDigits(t))}
            placeholder="0"
            placeholderTextColor={Colors.gray300}
            keyboardType="number-pad"
          />
          <Text style={styles.amountUnit}>원</Text>
        </View>

        <Text style={styles.label}>오늘 할인액 (선택)</Text>
        <View style={styles.amountRow}>
          <Ionicons name="pricetag-outline" size={16} color={Colors.gray500} />
          <TextInput
            style={styles.amountInput}
            value={discountAmount}
            onChangeText={t => setDiscountAmount(onlyDigits(t))}
            placeholder="0"
            placeholderTextColor={Colors.gray300}
            keyboardType="number-pad"
          />
          <Text style={styles.amountUnit}>원</Text>
        </View>

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>총 매출</Text>
          <Text style={styles.totalValue}>{fmtWon(total)}</Text>
          {discountNum > 0 && (
            <Text style={styles.totalSub}>할인 {fmtWon(discountNum)} 포함 · 할인 전 {fmtWon(total + discountNum)}</Text>
          )}
        </View>

        <Text style={styles.label}>메모 (선택)</Text>
        <TextInput
          style={styles.memoInput}
          value={memo}
          onChangeText={setMemo}
          placeholder="예: POS 미연동 매장 수기 마감"
          placeholderTextColor={Colors.gray400}
          multiline
        />

        <Button label={saving ? '등록 중...' : '등록하기'} variant="primary" onPress={handleSave} loading={saving} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  scroll: { padding: Spacing.screenX, paddingBottom: 40, gap: 10 },

  label: { fontSize: 13, fontWeight: '700', color: Colors.gray600, marginTop: 6 },
  hint: { fontSize: 11, fontWeight: '400', color: Colors.gray400, marginTop: -4 },

  dateInput: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, backgroundColor: Colors.white,
  },
  dateText: { fontSize: 14, fontWeight: '600', color: Colors.black },

  amountRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: 12,
    paddingHorizontal: 14, backgroundColor: Colors.white,
  },
  amountInput: { flex: 1, fontSize: 18, fontWeight: '700', color: Colors.black, paddingVertical: 13 },
  amountUnit: { fontSize: 14, fontWeight: '600', color: Colors.gray400 },

  totalCard: {
    backgroundColor: Colors.tinted, borderRadius: 14, padding: 16, gap: 3, marginTop: 4,
  },
  totalLabel: { fontSize: 12, fontWeight: '600', color: Colors.gray500 },
  totalValue: { fontSize: 24, fontWeight: '700', color: Colors.black, letterSpacing: -0.5 },
  totalSub: { fontSize: 11, fontWeight: '500', color: Colors.gray500 },

  memoInput: {
    minHeight: 64, borderWidth: 1, borderColor: Colors.gray200, borderRadius: 12,
    padding: 12, fontSize: 14, color: Colors.black, backgroundColor: Colors.white,
    textAlignVertical: 'top',
  },
});
