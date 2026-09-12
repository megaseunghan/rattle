import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { createManualSale } from '../../lib/services/manualSales';
import { getErrorMessage } from '../../lib/utils/error';
import { ManualSalePaymentMethod } from '../../types';
import { AppBar, Button } from '../../lib/components/ui';

const PAYMENT_METHODS: { key: ManualSalePaymentMethod; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'card', label: '카드', icon: 'card-outline' },
  { key: 'cash', label: '현금', icon: 'cash-outline' },
  { key: 'delivery', label: '배달앱', icon: 'bicycle-outline' },
];

function formatDate(d: Date): string {
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 화면 11 · 매출 추가 — 수기 매출 입력 폼 */
export default function ManualSaleNewScreen() {
  const { store } = useAuth();
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<ManualSalePaymentMethod>('card');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!store) return;
    const amountNum = Number(amount.replace(/[^0-9]/g, ''));
    if (!amountNum || amountNum <= 0) {
      Alert.alert('입력 오류', '매출액을 올바르게 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      await createManualSale({
        storeId: store.id,
        date: toDateKey(date),
        amount: amountNum,
        paymentMethod,
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

        <Text style={styles.label}>매출액</Text>
        <View style={styles.amountRow}>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={t => setAmount(t.replace(/[^0-9]/g, ''))}
            placeholder="0"
            placeholderTextColor={Colors.gray300}
            keyboardType="number-pad"
          />
          <Text style={styles.amountUnit}>원</Text>
        </View>

        <Text style={styles.label}>결제수단</Text>
        <View style={styles.chipRow}>
          {PAYMENT_METHODS.map(m => (
            <TouchableOpacity
              key={m.key}
              style={[styles.chip, paymentMethod === m.key && styles.chipActive]}
              onPress={() => setPaymentMethod(m.key)}
              activeOpacity={0.7}
            >
              <Ionicons name={m.icon} size={15} color={paymentMethod === m.key ? Colors.white : Colors.gray500} />
              <Text style={[styles.chipText, paymentMethod === m.key && styles.chipTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
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
  amountInput: { flex: 1, fontSize: 20, fontWeight: '700', color: Colors.black, paddingVertical: 13 },
  amountUnit: { fontSize: 14, fontWeight: '600', color: Colors.gray400 },

  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray200,
  },
  chipActive: { backgroundColor: Colors.black, borderColor: Colors.black },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.gray600 },
  chipTextActive: { color: Colors.white },

  memoInput: {
    minHeight: 64, borderWidth: 1, borderColor: Colors.gray200, borderRadius: 12,
    padding: 12, fontSize: 14, color: Colors.black, backgroundColor: Colors.white,
    textAlignVertical: 'top',
  },
});
