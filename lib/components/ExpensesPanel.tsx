import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useAuth } from '../contexts/AuthContext';
import { useExpenses } from '../hooks/useExpenses';
import { Expense, ExpenseCategory } from '../../types';
import { animateListChange } from '../utils/layoutAnimation';
import { getErrorMessage } from '../utils/error';
import { Field } from './ui';

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

/** 비용(고정비/마케팅/시설보수/공과금) 관리 패널 — /expenses 라우트와 매입 탭의 '비용' 세그먼트가 공유한다 */
export function ExpensesPanel() {
  const { currentRole } = useAuth();
  const isAdmin = currentRole === 'admin';
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-based

  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<ExpenseCategory | null>(null);
  const [editingItem, setEditingItem] = useState<Expense | null>(null);
  const [inputName, setInputName] = useState('');
  const [inputAmount, setInputAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const yearMonth = toYearMonth(year, month);
  const { expenses, carriedFixedExpenses, loading, refetch, add, update, remove, copyCarriedFixedExpenses } = useExpenses(yearMonth);
  const [copying, setCopying] = useState(false);

  useEffect(() => { refetch(); }, [refetch]);

  const [refreshing, setRefreshing] = useState(false);
  async function onRefresh() {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }

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
    setEditingItem(null);
    setInputName('');
    setInputAmount('');
    setModalVisible(true);
  }

  function openEditModal(item: Expense) {
    setEditTarget(item.category);
    setEditingItem(item);
    setInputName(item.name);
    setInputAmount(String(item.amount));
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
      if (editingItem) {
        await update(editingItem.id, { name, amount });
      } else {
        await add({ category: editTarget, name, amount });
      }
      setModalVisible(false);
    } catch (e: unknown) {
      Alert.alert('저장 실패', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyCarried() {
    setCopying(true);
    try {
      await copyCarriedFixedExpenses();
    } catch (e: unknown) {
      Alert.alert('적용 실패', getErrorMessage(e));
    } finally {
      setCopying(false);
    }
  }

  async function handleDelete(id: string) {
    Alert.alert('삭제', '이 항목을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: async () => {
          try { animateListChange(); await remove(id); }
          catch (e: unknown) { Alert.alert('삭제 실패', getErrorMessage(e)); }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.title}>비용</Text>
        <Text style={styles.totalAmount}>
          {loading ? '' : totalAmount > 0 ? `${totalAmount.toLocaleString()}원` : '—'}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >

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
          const carriedItems = cat.key === '고정비' ? carriedFixedExpenses : [];
          const catTotal = catItems.length > 0
            ? catItems.reduce((s, e) => s + e.amount, 0)
            : carriedItems.reduce((s, e) => s + e.amount, 0);
          const locked = cat.key === '고정비' && !isAdmin; // 고정비는 관리자만 수정

          return (
            <View key={cat.key} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.catIconBg, { backgroundColor: cat.bg }]}>
                  <Ionicons name={cat.icon} size={16} color={cat.color} />
                </View>
                <Text style={styles.catLabel}>{cat.key}</Text>
                {locked && <Ionicons name="lock-closed" size={12} color={Colors.gray400} style={{ marginLeft: 4 }} />}
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
                ) : catItems.length === 0 && carriedItems.length === 0 ? (
                  <View style={styles.emptyRow}>
                    <Text style={styles.emptyText}>등록된 항목이 없어요</Text>
                  </View>
                ) : catItems.length > 0 ? (
                  catItems.map((item, idx) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.itemRow, idx < catItems.length - 1 && styles.rowBorder]}
                      onPress={locked ? undefined : () => openEditModal(item)}
                      onLongPress={locked ? undefined : () => handleDelete(item.id)}
                      activeOpacity={locked ? 1 : 0.7}
                    >
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemAmount}>{item.amount.toLocaleString()}원</Text>
                      {!locked && (
                        <TouchableOpacity
                          onPress={() => handleDelete(item.id)}
                          hitSlop={8}
                          style={styles.deleteIconBtn}
                        >
                          <Ionicons name="trash-outline" size={16} color={Colors.gray300} />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  ))
                ) : (
                  <>
                    <View style={styles.carriedBanner}>
                      <Ionicons name="repeat-outline" size={13} color={Colors.gray500} />
                      <Text style={styles.carriedBannerText}>지난달과 동일(자동 적용)</Text>
                    </View>
                    {carriedItems.map((item, idx) => (
                      <View
                        key={item.id}
                        style={[styles.itemRow, idx < carriedItems.length - 1 && styles.rowBorder]}
                      >
                        <Text style={[styles.itemName, styles.carriedText]}>{item.name}</Text>
                        <Text style={[styles.itemAmount, styles.carriedText]}>{item.amount.toLocaleString()}원</Text>
                      </View>
                    ))}
                    {!locked && (
                      <TouchableOpacity
                        style={[styles.addRow, styles.addRowBorder]}
                        onPress={handleCopyCarried}
                        disabled={copying}
                        activeOpacity={0.7}
                      >
                        {copying
                          ? <ActivityIndicator size="small" color={cat.color} />
                          : (
                            <>
                              <Ionicons name="create-outline" size={16} color={cat.color} />
                              <Text style={[styles.addRowText, { color: cat.color }]}>이번 달로 복사해서 수정</Text>
                            </>
                          )}
                      </TouchableOpacity>
                    )}
                  </>
                )}

                {locked ? (
                  <View style={[styles.addRow, (catItems.length > 0 || carriedItems.length > 0) && styles.addRowBorder]}>
                    <Ionicons name="lock-closed-outline" size={14} color={Colors.gray400} />
                    <Text style={[styles.addRowText, { color: Colors.gray400 }]}>관리자만 수정할 수 있어요</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.addRow, (catItems.length > 0 || carriedItems.length > 0) && styles.addRowBorder]}
                    onPress={() => openAddModal(cat.key)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add-circle-outline" size={16} color={cat.color} />
                    <Text style={[styles.addRowText, { color: cat.color }]}>항목 추가</Text>
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
            <View style={styles.sheetHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={8}>
                <Text style={styles.sheetCancelText}>취소</Text>
              </TouchableOpacity>
              <Text style={styles.sheetHeaderTitle}>{editTarget} 항목 {editingItem ? '수정' : '추가'}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={8}>
                {saving
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Text style={styles.sheetSaveText}>저장</Text>}
              </TouchableOpacity>
            </View>

            <View style={styles.modalFieldGroup}>
              <Field
                label="항목명"
                value={inputName}
                onChangeText={setInputName}
                placeholder="예: 임대료, 인스타그램 광고"
              />
              <Field
                label="금액"
                value={inputAmount}
                onChangeText={setInputAmount}
                placeholder="0"
                keyboardType="numeric"
              />
            </View>

          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
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
  carriedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6,
  },
  carriedBannerText: { fontSize: 12, color: Colors.gray500 },
  carriedText: { color: Colors.gray500 },
  card: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.gray100 },
  emptyRow: { paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center' },
  emptyText: { fontSize: 13, color: Colors.gray300 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
  },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  itemName: { fontSize: 14, color: Colors.black, flex: 1 },
  itemAmount: { fontSize: 14, fontWeight: '600', color: Colors.black, marginRight: 10 },
  deleteIconBtn: { padding: 2 },
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
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  sheetHeaderTitle: { fontSize: 16, fontWeight: '700', color: Colors.black },
  sheetCancelText: { fontSize: 15, fontWeight: '500', color: Colors.gray500 },
  sheetSaveText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  modalFieldGroup: { gap: 14 },
});
