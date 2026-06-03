import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useExpenses } from '../../lib/hooks/useExpenses';
import { ExpenseCategory } from '../../types';

const CATEGORIES: {
  key: ExpenseCategory;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
}[] = [
  { key: '마케팅',  icon: 'megaphone-outline',   color: '#7C3AED', bg: '#F3EEFF' },
  { key: '고정비',  icon: 'receipt-outline',      color: '#0891B2', bg: '#E0F7FA' },
  { key: '시설보수', icon: 'build-outline',        color: '#D97706', bg: '#FEF3C7' },
  { key: '공과금',  icon: 'flash-outline',        color: '#059669', bg: '#D1FAE5' },
];

function toYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export default function ExpensesScreen() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-based

  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<ExpenseCategory | null>(null);
  const [inputName, setInputName] = useState('');
  const [inputAmount, setInputAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const yearMonth = toYearMonth(year, month);
  const { expenses, loading, refetch, add, remove } = useExpenses(yearMonth);

  useEffect(() => { refetch(); }, [refetch]);

  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  function openAddModal(category: ExpenseCategory) {
    setEditTarget(category);
    setInputName('');
    setInputAmount('');
    setModalVisible(true);
  }

  async function handleSave() {
    if (!editTarget) return;
    const name = inputName.trim();
    const amount = Number(inputAmount.replace(/,/g, ''));
    if (!name) { Alert.alert('입력 오류', '항목명을 입력해주세요.'); return; }
    if (!amount || amount <= 0) { Alert.alert('입력 오류', '금액을 올바르게 입력해주세요.'); return; }

    setSaving(true);
    try {
      await add({ category: editTarget, name, amount });
      setModalVisible(false);
    } catch (e: any) {
      Alert.alert('저장 실패', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    Alert.alert('삭제', '이 항목을 삭제할까요?', [
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
        <Text style={styles.title}>비용</Text>
        <Text style={styles.totalAmount}>
          {loading ? '' : totalAmount > 0 ? `${totalAmount.toLocaleString()}원` : '—'}
        </Text>
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

        {CATEGORIES.map(cat => {
          const catItems = expenses.filter(e => e.category === cat.key);
          const catTotal = catItems.reduce((s, e) => s + e.amount, 0);

          return (
            <View key={cat.key} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.catIconBg, { backgroundColor: cat.bg }]}>
                  <Ionicons name={cat.icon} size={16} color={cat.color} />
                </View>
                <Text style={styles.catLabel}>{cat.key}</Text>
                {catTotal > 0 && (
                  <Text style={[styles.catTotal, { color: cat.color }]}>
                    {catTotal.toLocaleString()}원
                  </Text>
                )}
              </View>

              <View style={styles.card}>
                {loading ? (
                  <View style={styles.emptyRow}>
                    <ActivityIndicator size="small" color={Colors.gray300} />
                  </View>
                ) : catItems.length === 0 ? (
                  <View style={styles.emptyRow}>
                    <Text style={styles.emptyText}>등록된 항목이 없어요</Text>
                  </View>
                ) : (
                  catItems.map((item, idx) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.itemRow, idx < catItems.length - 1 && styles.rowBorder]}
                      onLongPress={() => handleDelete(item.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemAmount}>{item.amount.toLocaleString()}원</Text>
                    </TouchableOpacity>
                  ))
                )}

                <TouchableOpacity
                  style={[styles.addRow, catItems.length > 0 && styles.addRowBorder]}
                  onPress={() => openAddModal(cat.key)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add-circle-outline" size={16} color={cat.color} />
                  <Text style={[styles.addRowText, { color: cat.color }]}>항목 추가</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editTarget} 항목 추가</Text>

            <Text style={styles.fieldLabel}>항목명</Text>
            <TextInput
              style={styles.input}
              value={inputName}
              onChangeText={setInputName}
              placeholder="예: 임대료, 인스타그램 광고"
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

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={saving}
              >
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
  totalAmount: { fontSize: 15, fontWeight: '600', color: Colors.black },
  scroll: { padding: 16, gap: 14, paddingBottom: 48 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: {
    width: 36, height: 36, justifyContent: 'center', alignItems: 'center',
    borderRadius: 10, backgroundColor: Colors.white, borderWidth: 0.5, borderColor: Colors.gray100,
  },
  monthLabel: { fontSize: 15, fontWeight: '600', color: Colors.black },
  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catIconBg: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  catLabel: { fontSize: 14, fontWeight: '600', color: Colors.black, flex: 1 },
  catTotal: { fontSize: 14, fontWeight: '700' },
  card: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.gray100 },
  emptyRow: { paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center' },
  emptyText: { fontSize: 13, color: Colors.gray300 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
  },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  itemName: { fontSize: 14, color: Colors.black, flex: 1 },
  itemAmount: { fontSize: 14, fontWeight: '600', color: Colors.black },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  addRowBorder: { borderTopWidth: 0.5, borderTopColor: Colors.gray100 },
  addRowText: { fontSize: 13, fontWeight: '500' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  modalSheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.gray200,
    alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.black, marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    color: Colors.black, backgroundColor: Colors.gray50,
  },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.gray100, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.gray600 },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.black, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '600', color: Colors.white },
});
