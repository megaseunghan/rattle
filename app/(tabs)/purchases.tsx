import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { usePurchases } from '../../lib/hooks/usePurchases';
import { PurchaseCategory, PurchaseType } from '../../types';

const TABS = ['전체', '전자세금계산서', '수기'] as const;
type Tab = (typeof TABS)[number];

const CATEGORIES: PurchaseCategory[] = ['식자재', '비품', '소모품', '주류', '기타'];
const TYPES: PurchaseType[] = ['전자세금계산서', '쿠팡', '네이버', '수기'];

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function getCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = Array(firstDay).fill(null);
  for (let i = 1; i <= lastDate; i++) days.push(i);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toYearMonth(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export default function PurchasesScreen() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [activeTab, setActiveTab] = useState<Tab>('전체');

  const [modalVisible, setModalVisible] = useState(false);
  const [inputSupplier, setInputSupplier] = useState('');
  const [inputAmount, setInputAmount] = useState('');
  const [inputCategory, setInputCategory] = useState<PurchaseCategory>('식자재');
  const [inputType, setInputType] = useState<PurchaseType>('수기');
  const [saving, setSaving] = useState(false);

  const yearMonth = toYearMonth(year, month);
  const { purchases, loading, refetch, add, remove } = usePurchases(yearMonth);

  useEffect(() => { refetch(); }, [refetch]);

  const days = getCalendarDays(year, month);

  const filtered = purchases.filter(
    p => activeTab === '전체' || p.type === activeTab
  );

  const purchaseByDay = new Map<string, typeof filtered>();
  filtered.forEach(p => {
    const list = purchaseByDay.get(p.date) ?? [];
    list.push(p);
    purchaseByDay.set(p.date, list);
  });

  const selectedKey = selectedDay ? toDateKey(year, month, selectedDay) : null;
  const selectedPurchases = selectedKey ? (purchaseByDay.get(selectedKey) ?? []) : [];

  const monthTotal = filtered.reduce((sum, p) => sum + p.amount, 0);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  }

  const isToday = (day: number) =>
    year === today.getFullYear() && month === today.getMonth() && day === today.getDate();

  async function handleSave() {
    const supplier = inputSupplier.trim();
    const amount = Number(inputAmount.replace(/,/g, ''));
    if (!supplier) { Alert.alert('입력 오류', '거래처명을 입력해주세요.'); return; }
    if (!amount || amount <= 0) { Alert.alert('입력 오류', '금액을 올바르게 입력해주세요.'); return; }

    setSaving(true);
    try {
      const dateStr = selectedDay
        ? toDateKey(year, month, selectedDay)
        : toDateKey(year, month, today.getDate());
      await add({
        date: dateStr,
        supplier,
        amount,
        category: inputCategory,
        type: inputType,
        note: null,
      });
      setModalVisible(false);
      setInputSupplier('');
      setInputAmount('');
    } catch (e: any) {
      Alert.alert('저장 실패', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    Alert.alert('삭제', '이 매입 내역을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: async () => {
          try { await remove(id); }
          catch (e: any) { Alert.alert('삭제 실패', e.message); }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.title}>매입</Text>
        <Text style={styles.monthTotal}>
          {loading ? '' : monthTotal > 0 ? `${monthTotal.toLocaleString()}원` : '—'}
        </Text>
      </View>

      <View style={styles.tabRow}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.monthNav}>
          <TouchableOpacity onPress={prevMonth} style={styles.navBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={20} color={Colors.gray600} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{year}년 {month + 1}월</Text>
          <TouchableOpacity onPress={nextMonth} style={styles.navBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray600} />
          </TouchableOpacity>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={w} style={[styles.weekDay, i === 0 && styles.sundayText, i === 6 && styles.saturdayText]}>
                {w}
              </Text>
            ))}
          </View>
          {Array.from({ length: Math.ceil(days.length / 7) }, (_, rowIdx) => (
            <View key={rowIdx} style={styles.calendarRow}>
              {days.slice(rowIdx * 7, (rowIdx + 1) * 7).map((day, colIdx) => {
                if (!day) return <View key={`empty-${rowIdx}-${colIdx}`} style={styles.dayCell} />;
                const key = toDateKey(year, month, day);
                const hasPurchase = purchaseByDay.has(key);
                const isSelected = selectedDay === day;
                const todayFlag = isToday(day);
                const isSun = colIdx === 0;
                const isSat = colIdx === 6;
                return (
                  <TouchableOpacity
                    key={day}
                    style={styles.dayCell}
                    onPress={() => setSelectedDay(isSelected ? null : day)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.dayInner, isSelected && styles.daySelected, !isSelected && todayFlag && styles.dayToday]}>
                      <Text style={[
                        styles.dayText,
                        isSun && !isSelected && styles.sundayText,
                        isSat && !isSelected && styles.saturdayText,
                        isSelected && styles.dayTextSelected,
                        !isSelected && todayFlag && styles.dayTextToday,
                      ]}>
                        {day}
                      </Text>
                    </View>
                    {hasPurchase && <View style={[styles.dot, isSelected && styles.dotSelected]} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {selectedDay !== null && (
          <>
            <Text style={styles.sectionLabel}>{month + 1}월 {selectedDay}일 매입</Text>
            <View style={styles.listCard}>
              {loading ? (
                <View style={styles.emptyInCard}>
                  <ActivityIndicator size="small" color={Colors.gray300} />
                </View>
              ) : selectedPurchases.length === 0 ? (
                <View style={styles.emptyInCard}>
                  <Text style={styles.emptyInCardText}>매입 내역이 없어요</Text>
                </View>
              ) : (
                selectedPurchases.map((p, i) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.purchaseRow, i < selectedPurchases.length - 1 && styles.rowBorder]}
                    onLongPress={() => handleDelete(p.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.purchaseLeft}>
                      <Text style={styles.purchaseSupplier}>{p.supplier}</Text>
                      <View style={styles.typePill}>
                        <Text style={styles.typeText}>{p.category}</Text>
                      </View>
                      <View style={styles.typePill}>
                        <Text style={styles.typeText}>{p.type}</Text>
                      </View>
                    </View>
                    <Text style={styles.purchaseAmount}>{p.amount.toLocaleString()}원</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </>
        )}

        {selectedDay === null && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>이번 달 총 매입</Text>
            {loading
              ? <ActivityIndicator size="small" color={Colors.gray300} />
              : <Text style={styles.summaryValue}>{monthTotal > 0 ? `${monthTotal.toLocaleString()}원` : '—'}</Text>
            }
            {!loading && monthTotal === 0 && (
              <Text style={styles.summarySub}>매입 내역 등록 후 표시됩니다</Text>
            )}
          </View>
        )}

        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)} activeOpacity={0.7}>
          <Ionicons name="add" size={16} color={Colors.gray700} />
          <Text style={styles.addBtnText}>수기 매입 추가</Text>
        </TouchableOpacity>

      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>매입 추가</Text>

            <Text style={styles.fieldLabel}>거래처명</Text>
            <TextInput
              style={styles.input}
              value={inputSupplier}
              onChangeText={setInputSupplier}
              placeholder="예: 쿠팡, 농협, 대형마트"
              placeholderTextColor={Colors.gray300}
            />

            <Text style={styles.fieldLabel}>금액</Text>
            <TextInput
              style={styles.input}
              value={inputAmount}
              onChangeText={setInputAmount}
              placeholder="0"
              placeholderTextColor={Colors.gray300}
              keyboardType="numeric"
            />

            <Text style={styles.fieldLabel}>카테고리</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.chip, inputCategory === cat && styles.chipActive]}
                  onPress={() => setInputCategory(cat)}
                >
                  <Text style={[styles.chipText, inputCategory === cat && styles.chipTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>유형</Text>
            <View style={styles.chipRow}>
              {TYPES.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, inputType === t && styles.chipActive]}
                  onPress={() => setInputType(t)}
                >
                  <Text style={[styles.chipText, inputType === t && styles.chipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.5 }]} onPress={handleSave} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Text style={styles.saveBtnText}>저장</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
  },
  title: { fontSize: 17, fontWeight: '600', color: Colors.black },
  monthTotal: { fontSize: 15, fontWeight: '600', color: Colors.black },
  tabRow: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
  },
  tab: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    borderWidth: 0.5, borderColor: Colors.gray200, backgroundColor: Colors.gray50,
  },
  tabActive: { backgroundColor: Colors.black, borderColor: Colors.black },
  tabText: { fontSize: 13, color: Colors.gray500 },
  tabTextActive: { color: Colors.white, fontWeight: '500' },
  scroll: { padding: 16, gap: 14, paddingBottom: 48 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: {
    width: 36, height: 36, justifyContent: 'center', alignItems: 'center',
    borderRadius: 10, backgroundColor: Colors.white, borderWidth: 0.5, borderColor: Colors.gray100,
  },
  monthLabel: { fontSize: 15, fontWeight: '600', color: Colors.black },
  calendarCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 0.5, borderColor: Colors.gray100, paddingHorizontal: 8, paddingVertical: 12,
  },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '500', color: Colors.gray400, paddingVertical: 4 },
  sundayText: { color: '#D94040' },
  saturdayText: { color: '#3A7FD4' },
  calendarRow: { flexDirection: 'row' },
  dayCell: { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 3 },
  dayInner: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  daySelected: { backgroundColor: Colors.black },
  dayToday: { borderWidth: 1.5, borderColor: Colors.primary },
  dayText: { fontSize: 14, color: Colors.black },
  dayTextSelected: { color: Colors.white, fontWeight: '600' },
  dayTextToday: { color: Colors.primary, fontWeight: '600' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary },
  dotSelected: { backgroundColor: Colors.white },
  sectionLabel: { fontSize: 11, fontWeight: '500', color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5 },
  listCard: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.gray100 },
  emptyInCard: { paddingVertical: 24, alignItems: 'center' },
  emptyInCardText: { fontSize: 14, color: Colors.gray400 },
  purchaseRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13,
    justifyContent: 'space-between',
  },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  purchaseLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  purchaseSupplier: { fontSize: 14, fontWeight: '500', color: Colors.black },
  typePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: Colors.gray100 },
  typeText: { fontSize: 11, color: Colors.gray500 },
  purchaseAmount: { fontSize: 14, fontWeight: '600', color: Colors.black },
  summaryCard: {
    backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5,
    borderColor: Colors.gray100, padding: 20, alignItems: 'center', gap: 4,
  },
  summaryLabel: { fontSize: 12, color: Colors.gray400 },
  summaryValue: { fontSize: 26, fontWeight: '700', color: Colors.black },
  summarySub: { fontSize: 12, color: Colors.gray300, marginTop: 2 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.white, borderRadius: 14, borderWidth: 0.5,
    borderColor: Colors.gray200, paddingVertical: 14,
  },
  addBtnText: { fontSize: 14, color: Colors.gray700 },
  // 모달
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  modalSheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.gray200,
    alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.black, marginBottom: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    color: Colors.black, backgroundColor: Colors.gray50,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.gray200, backgroundColor: Colors.gray50,
  },
  chipActive: { backgroundColor: Colors.black, borderColor: Colors.black },
  chipText: { fontSize: 13, color: Colors.gray500 },
  chipTextActive: { color: Colors.white, fontWeight: '500' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    backgroundColor: Colors.gray100, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.gray600 },
  saveBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    backgroundColor: Colors.black, alignItems: 'center',
  },
  saveBtnText: { fontSize: 14, fontWeight: '600', color: Colors.white },
});
