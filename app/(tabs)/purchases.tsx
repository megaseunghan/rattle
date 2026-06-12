import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { usePurchases } from '../../lib/hooks/usePurchases';
import { useExpenses } from '../../lib/hooks/useExpenses';
import { callOcrEdgeFunction } from '../../lib/services/ocr';
import { Expense, ExpenseCategory } from '../../types';

// ─── 공통 ──────────────────────────────────────────────────
const PURCHASE_TABS = ['전체', '전자세금계산서', '수기'] as const;
type PurchaseTab = (typeof PURCHASE_TABS)[number];

const EXPENSE_CATEGORIES: { key: ExpenseCategory; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }[] = [
  { key: '마케팅',  icon: 'megaphone-outline', color: '#7C3AED', bg: '#F3EEFF' },
  { key: '고정비',  icon: 'receipt-outline',   color: '#0891B2', bg: '#E0F7FA' },
  { key: '시설보수', icon: 'build-outline',     color: '#D97706', bg: '#FEF3C7' },
  { key: '공과금',  icon: 'flash-outline',     color: '#059669', bg: '#D1FAE5' },
];

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

function MonthNav({ year, month, onPrev, onNext }: { year: number; month: number; onPrev: () => void; onNext: () => void }) {
  return (
    <View style={styles.monthNav}>
      <TouchableOpacity onPress={onPrev} style={styles.navBtn} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={20} color={Colors.gray600} />
      </TouchableOpacity>
      <Text style={styles.monthLabel}>{year}년 {month + 1}월</Text>
      <TouchableOpacity onPress={onNext} style={styles.navBtn} activeOpacity={0.7}>
        <Ionicons name="chevron-forward" size={20} color={Colors.gray600} />
      </TouchableOpacity>
    </View>
  );
}

// ─── 매입 뷰 ───────────────────────────────────────────────
function PurchasesView() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [activeTab, setActiveTab] = useState<PurchaseTab>('전체');
  const [scanning, setScanning] = useState(false);

  const yearMonth = toYearMonth(year, month);
  const { purchases, loading, refetch, remove } = usePurchases(yearMonth);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const days = getCalendarDays(year, month);
  const filtered = purchases.filter(p => activeTab === '전체' || p.type === activeTab);
  const purchaseByDay = new Map<string, typeof filtered>();
  filtered.forEach(p => {
    const list = purchaseByDay.get(p.date) ?? [];
    list.push(p);
    purchaseByDay.set(p.date, list);
  });
  const selectedKey = selectedDay ? toDateKey(year, month, selectedDay) : null;
  const selectedPurchases = selectedKey ? (purchaseByDay.get(selectedKey) ?? []) : [];
  const monthTotal = filtered.reduce((s, p) => s + p.amount, 0);
  const isToday = (day: number) => year === today.getFullYear() && month === today.getMonth() && day === today.getDate();

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1);
    setSelectedDay(null);
  }

  function goNewPurchase() {
    const dateParam = selectedDay ? toDateKey(year, month, selectedDay) : undefined;
    router.push({ pathname: '/purchases/new', params: dateParam ? { date: dateParam } : {} });
  }

  function handleScan() {
    Alert.alert('매입서 스캔', '이미지를 어떻게 가져올까요?', [
      {
        text: '카메라로 촬영',
        onPress: async () => {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) { Alert.alert('권한 필요', '카메라 권한이 필요합니다. 설정에서 허용해주세요.'); return; }
          const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.8 });
          if (!result.canceled && result.assets[0].base64) {
            await processImages([{ uri: result.assets[0].uri, base64: result.assets[0].base64 }]);
          }
        },
      },
      {
        text: '앨범에서 선택',
        onPress: async () => {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) { Alert.alert('권한 필요', '사진 접근 권한이 필요합니다. 설정에서 허용해주세요.'); return; }
          const result = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.8, allowsMultipleSelection: true });
          if (!result.canceled && result.assets.length > 0) {
            const assets = result.assets.filter(a => a.base64) as Array<{ uri: string; base64: string }>;
            if (assets.length > 0) await processImages(assets);
          }
        },
      },
      { text: '취소', style: 'cancel' },
    ]);
  }

  async function processImages(assets: Array<{ uri: string; base64: string }>) {
    setScanning(true);
    try {
      const allItems: unknown[] = [];
      for (const asset of assets) {
        const manipulated = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 1200 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        const ocrText = await callOcrEdgeFunction(manipulated.base64!);
        const parsed = JSON.parse(ocrText);
        if (Array.isArray(parsed)) allItems.push(...parsed);
      }
      router.push({
        pathname: '/purchases/ocr-review',
        params: { imageUri: assets[0].uri, ocrText: JSON.stringify(allItems) },
      });
    } catch (e: any) {
      Alert.alert('OCR 오류', e.message);
    } finally {
      setScanning(false);
    }
  }

  return (
    <>
      <View style={styles.subTabRow}>
        {PURCHASE_TABS.map(tab => (
          <TouchableOpacity key={tab} style={[styles.subTab, activeTab === tab && styles.subTabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.subTabText, activeTab === tab && styles.subTabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.monthTotalRight}>{loading ? '' : monthTotal > 0 ? `${monthTotal.toLocaleString()}원` : ''}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <MonthNav year={year} month={month} onPrev={prevMonth} onNext={nextMonth} />

        <View style={styles.calendarCard}>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={w} style={[styles.weekDay, i === 0 && styles.sundayText, i === 6 && styles.saturdayText]}>{w}</Text>
            ))}
          </View>
          {Array.from({ length: Math.ceil(days.length / 7) }, (_, rowIdx) => (
            <View key={rowIdx} style={styles.calendarRow}>
              {days.slice(rowIdx * 7, (rowIdx + 1) * 7).map((day, colIdx) => {
                if (!day) return <View key={`e-${rowIdx}-${colIdx}`} style={styles.dayCell} />;
                const key = toDateKey(year, month, day);
                const isSelected = selectedDay === day;
                const todayFlag = isToday(day);
                return (
                  <TouchableOpacity key={day} style={styles.dayCell} onPress={() => setSelectedDay(isSelected ? null : day)} activeOpacity={0.7}>
                    <View style={[styles.dayInner, isSelected && styles.daySelected, !isSelected && todayFlag && styles.dayToday]}>
                      <Text style={[styles.dayText, colIdx === 0 && !isSelected && styles.sundayText, colIdx === 6 && !isSelected && styles.saturdayText, isSelected && styles.dayTextSelected, !isSelected && todayFlag && styles.dayTextToday]}>{day}</Text>
                    </View>
                    {purchaseByDay.has(key) && <View style={[styles.dot, isSelected && styles.dotSelected]} />}
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
              {loading ? <View style={styles.emptyInCard}><ActivityIndicator size="small" color={Colors.gray300} /></View>
                : selectedPurchases.length === 0 ? <View style={styles.emptyInCard}><Text style={styles.emptyInCardText}>매입 내역이 없어요</Text></View>
                : selectedPurchases.map((p, i) => (
                  <TouchableOpacity key={p.id} style={[styles.purchaseRow, i < selectedPurchases.length - 1 && styles.rowBorder]} onPress={() => router.push(`/purchases/${p.id}`)} onLongPress={() => Alert.alert('삭제', '이 매입 내역을 삭제할까요?', [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => remove(p.id).catch(e => Alert.alert('삭제 실패', e.message)) }])} activeOpacity={0.7}>
                    <View style={styles.purchaseLeft}>
                      <Text style={styles.purchaseSupplier}>{p.supplier}</Text>
                      <View style={styles.typePill}><Text style={styles.typeText}>{p.category}</Text></View>
                      <View style={styles.typePill}><Text style={styles.typeText}>{p.type}</Text></View>
                    </View>
                    <Text style={styles.purchaseAmount}>{p.amount.toLocaleString()}원</Text>
                  </TouchableOpacity>
                ))
              }
            </View>
          </>
        )}

        {selectedDay === null && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>이번 달 총 매입</Text>
            {loading ? <ActivityIndicator size="small" color={Colors.gray300} />
              : <Text style={styles.summaryValue}>{monthTotal > 0 ? `${monthTotal.toLocaleString()}원` : '—'}</Text>}
          </View>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.scanBtn, scanning && { opacity: 0.5 }]} onPress={handleScan} disabled={scanning} activeOpacity={0.7}>
            {scanning ? <ActivityIndicator size="small" color={Colors.primary} /> : <Ionicons name="camera-outline" size={18} color={Colors.primary} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={goNewPurchase} activeOpacity={0.7}>
            <Ionicons name="add" size={16} color={Colors.gray700} />
            <Text style={styles.addBtnText}>매입 추가</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );
}

// ─── 비용 뷰 ───────────────────────────────────────────────
function ExpensesView() {
  const { currentRole } = useAuth();
  const isAdmin = currentRole === 'admin';
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<ExpenseCategory | null>(null);
  const [editId, setEditId] = useState<string | null>(null); // null이면 신규, 있으면 수정
  const [inputName, setInputName] = useState('');
  const [inputAmount, setInputAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  const { expenses, loading, refetch, add, update, remove } = useExpenses(yearMonth);
  useEffect(() => { refetch(); }, [refetch]);

  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);

  function prevMonth() { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); }

  function openAdd(category: ExpenseCategory) {
    setEditTarget(category); setEditId(null); setInputName(''); setInputAmount(''); setModalVisible(true);
  }
  function openEdit(item: Expense) {
    setEditTarget(item.category); setEditId(item.id);
    setInputName(item.name); setInputAmount(String(item.amount)); setModalVisible(true);
  }

  async function handleSave() {
    if (!editTarget) return;
    const name = inputName.trim();
    const amount = Number(inputAmount.replace(/,/g, ''));
    if (!name) { Alert.alert('입력 오류', '항목명을 입력해주세요.'); return; }
    if (!amount || amount <= 0) { Alert.alert('입력 오류', '금액을 올바르게 입력해주세요.'); return; }
    setSaving(true);
    try {
      if (editId) await update(editId, { name, amount });
      else await add({ category: editTarget, name, amount });
      setModalVisible(false);
    }
    catch (e: any) { Alert.alert('저장 실패', e.message); }
    finally { setSaving(false); }
  }

  return (
    <>
      <View style={styles.expensesHeader}>
        <Text style={styles.expensesTotal}>{loading ? '' : totalAmount > 0 ? `${totalAmount.toLocaleString()}원` : '—'}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={prevMonth} style={styles.navBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={20} color={Colors.gray600} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{year}년 {month}월</Text>
          <TouchableOpacity onPress={nextMonth} style={styles.navBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray600} />
          </TouchableOpacity>
        </View>

        {EXPENSE_CATEGORIES.map(cat => {
          const catItems = expenses.filter(e => e.category === cat.key);
          const catTotal = catItems.reduce((s, e) => s + e.amount, 0);
          const locked = cat.key === '고정비' && !isAdmin; // 고정비는 관리자만 수정
          return (
            <View key={cat.key} style={styles.expSection}>
              <View style={styles.expSectionHeader}>
                <View style={[styles.catIconBg, { backgroundColor: cat.bg }]}>
                  <Ionicons name={cat.icon} size={16} color={cat.color} />
                </View>
                <Text style={styles.catLabel}>{cat.key}</Text>
                {locked && <Ionicons name="lock-closed" size={12} color={Colors.gray400} style={{ marginLeft: 4 }} />}
                {catTotal > 0 && <Text style={[styles.catTotal, { color: cat.color }]}>{catTotal.toLocaleString()}원</Text>}
              </View>
              <View style={styles.listCard}>
                {loading ? <View style={styles.emptyInCard}><ActivityIndicator size="small" color={Colors.gray300} /></View>
                  : catItems.length === 0 ? <View style={styles.emptyInCard}><Text style={styles.emptyInCardText}>등록된 항목이 없어요</Text></View>
                  : catItems.map((item, idx) => (
                    <TouchableOpacity key={item.id} style={[styles.itemRow, idx < catItems.length - 1 && styles.rowBorder]} onPress={locked ? undefined : () => openEdit(item)} onLongPress={locked ? undefined : () => Alert.alert('삭제', '이 항목을 삭제할까요?', [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => remove(item.id).catch(e => Alert.alert('삭제 실패', e.message)) }])} activeOpacity={locked ? 1 : 0.7}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <View style={styles.itemRight}>
                        <Text style={styles.itemAmount}>{item.amount.toLocaleString()}원</Text>
                        {!locked && <Ionicons name="chevron-forward" size={14} color={Colors.gray300} />}
                      </View>
                    </TouchableOpacity>
                  ))
                }
                {locked ? (
                  <View style={[styles.addCatRow, catItems.length > 0 && styles.addCatRowBorder]}>
                    <Ionicons name="lock-closed-outline" size={14} color={Colors.gray400} />
                    <Text style={[styles.addCatRowText, { color: Colors.gray400 }]}>관리자만 수정할 수 있어요</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={[styles.addCatRow, catItems.length > 0 && styles.addCatRowBorder]} onPress={() => openAdd(cat.key)} activeOpacity={0.7}>
                    <Ionicons name="add-circle-outline" size={16} color={cat.color} />
                    <Text style={[styles.addCatRowText, { color: cat.color }]}>항목 추가</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editTarget} 항목 {editId ? '수정' : '추가'}</Text>
            <Text style={styles.fieldLabel}>항목명</Text>
            <TextInput style={styles.input} value={inputName} onChangeText={setInputName} placeholder="예: 임대료, 광고비" placeholderTextColor={Colors.gray300} />
            <Text style={styles.fieldLabel}>금액</Text>
            <TextInput style={styles.input} value={inputAmount} onChangeText={setInputAmount} placeholder="0" placeholderTextColor={Colors.gray300} keyboardType="numeric" />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}><Text style={styles.cancelBtnText}>취소</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.5 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.saveBtnText}>저장</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ─── 메인 화면 ─────────────────────────────────────────────
const INNER_TABS = ['매입', '비용'] as const;
type InnerTab = (typeof INNER_TABS)[number];

export default function PurchasesScreen() {
  const [innerTab, setInnerTab] = useState<InnerTab>('매입');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.innerTabRow}>
          {INNER_TABS.map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.innerTab, innerTab === tab && styles.innerTabActive]}
              onPress={() => setInnerTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[styles.innerTabText, innerTab === tab && styles.innerTabTextActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {innerTab === '매입' ? <PurchasesView /> : <ExpensesView />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  topBar: {
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12,
    backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
  },
  innerTabRow: { flexDirection: 'row', gap: 4, backgroundColor: Colors.gray100, borderRadius: 12, padding: 3 },
  innerTab: { flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center' },
  innerTabActive: { backgroundColor: Colors.white, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  innerTabText: { fontSize: 14, fontWeight: '500', color: Colors.gray400 },
  innerTabTextActive: { color: Colors.black, fontWeight: '700' },

  subTabRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100, alignItems: 'center' },
  subTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 0.5, borderColor: Colors.gray200, backgroundColor: Colors.gray50 },
  subTabActive: { backgroundColor: Colors.black, borderColor: Colors.black },
  subTabText: { fontSize: 13, color: Colors.gray500 },
  subTabTextActive: { color: Colors.white, fontWeight: '500' },
  monthTotalRight: { marginLeft: 'auto', fontSize: 13, fontWeight: '600', color: Colors.black },

  expensesHeader: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100, alignItems: 'flex-end' },
  expensesTotal: { fontSize: 14, fontWeight: '600', color: Colors.black },

  scroll: { padding: 16, gap: 14, paddingBottom: 48 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: Colors.white, borderWidth: 0.5, borderColor: Colors.gray100 },
  monthLabel: { fontSize: 15, fontWeight: '600', color: Colors.black },

  calendarCard: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.gray100, paddingHorizontal: 8, paddingVertical: 12 },
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
  dotSelected: { backgroundColor: Colors.black },

  sectionLabel: { fontSize: 11, fontWeight: '500', color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5 },
  listCard: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.gray100 },
  emptyInCard: { paddingVertical: 20, alignItems: 'center' },
  emptyInCardText: { fontSize: 14, color: Colors.gray400 },
  purchaseRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, justifyContent: 'space-between' },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  purchaseLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  purchaseSupplier: { fontSize: 14, fontWeight: '500', color: Colors.black },
  typePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: Colors.gray100 },
  typeText: { fontSize: 11, color: Colors.gray500 },
  purchaseAmount: { fontSize: 14, fontWeight: '600', color: Colors.black },

  summaryCard: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.gray100, padding: 20, alignItems: 'center', gap: 4 },
  summaryLabel: { fontSize: 12, color: Colors.gray400 },
  summaryValue: { fontSize: 26, fontWeight: '700', color: Colors.black },

  actionRow: { flexDirection: 'row', gap: 10 },
  scanBtn: { width: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.tinted, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.primary + '40' },
  addBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.white, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.gray200, paddingVertical: 14 },
  addBtnText: { fontSize: 14, color: Colors.gray700 },

  expSection: { gap: 8 },
  expSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catIconBg: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  catLabel: { fontSize: 14, fontWeight: '600', color: Colors.black, flex: 1 },
  catTotal: { fontSize: 14, fontWeight: '700' },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 },
  itemName: { fontSize: 14, color: Colors.black, flex: 1 },
  itemRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemAmount: { fontSize: 14, fontWeight: '600', color: Colors.black },
  addCatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  addCatRowBorder: { borderTopWidth: 0.5, borderTopColor: Colors.gray100 },
  addCatRowText: { fontSize: 13, fontWeight: '500' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  modalSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.gray200, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.black, marginBottom: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.black, backgroundColor: Colors.gray50 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.gray200, backgroundColor: Colors.gray50 },
  chipActive: { backgroundColor: Colors.black, borderColor: Colors.black },
  chipText: { fontSize: 13, color: Colors.gray500 },
  chipTextActive: { color: Colors.white, fontWeight: '500' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.gray100, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.gray600 },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.black, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '600', color: Colors.white },
});
