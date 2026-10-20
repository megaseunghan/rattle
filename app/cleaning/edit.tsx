import { getErrorMessage } from '../../lib/utils/error';
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/designTokens';
import { useCleaningChecklist } from '../../lib/hooks/useCleaningChecklist';
import { AppBar, Field, Button } from '../../lib/components/ui';
import { CleaningItem, CleaningSegment } from '../../types';

const SEGMENTS: { key: CleaningSegment; label: string }[] = [
  { key: 'open', label: '오픈' },
  { key: 'close', label: '마감' },
  { key: 'weekday', label: '요일별' },
];

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export default function CleaningEditScreen() {
  const { items, refetch, addItem, editItem, removeItem, reorder } = useCleaningChecklist();
  const [segment, setSegment] = useState<CleaningSegment>('open');
  const [orderedItems, setOrderedItems] = useState<CleaningItem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newWeekday, setNewWeekday] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  useEffect(() => {
    // items 배열 자체 순서는 reorder 후에도 안 바뀌고 sort_order 값만 바뀌므로 정렬해서 반영해야 함
    setOrderedItems(
      items.filter(i => i.segment === segment).sort((a, b) => a.sort_order - b.sort_order)
    );
  }, [items, segment]);

  async function handleAdd() {
    const title = newTitle.trim();
    if (!title) return;
    setSaving(true);
    try {
      await addItem(segment, title, segment === 'weekday' ? newWeekday : null);
      setNewTitle('');
    } catch (e: any) {
      Alert.alert('추가 실패', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(id: string, title: string) {
    setEditingId(id);
    setEditingTitle(title);
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    const title = editingTitle.trim();
    if (!title) return;
    try {
      await editItem(editingId, title);
      setEditingId(null);
    } catch (e: any) {
      Alert.alert('수정 실패', getErrorMessage(e));
    }
  }

  function confirmRemove(id: string, title: string) {
    Alert.alert('항목 삭제', `"${title}" 항목을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => removeItem(id).catch(e => Alert.alert('삭제 실패', getErrorMessage(e))) },
    ]);
  }

  async function handleDragEnd(data: CleaningItem[]) {
    setOrderedItems(data);
    setReordering(true);
    try {
      await reorder(data);
    } catch (e: any) {
      Alert.alert('순서 저장 실패', getErrorMessage(e));
    } finally {
      setReordering(false);
    }
  }

  function renderItem({ item, drag, isActive }: RenderItemParams<CleaningItem>) {
    return (
      <ScaleDecorator>
        <View style={[styles.row, isActive && styles.rowActive]}>
          {editingId === item.id ? (
            <View style={styles.editRow}>
              <View style={styles.editInput}>
                <Field label="항목명" value={editingTitle} onChangeText={setEditingTitle} placeholder="항목명" />
              </View>
              <TouchableOpacity onPress={handleSaveEdit} hitSlop={8}>
                <Text style={styles.saveText}>저장</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditingId(null)} hitSlop={8}>
                <Text style={styles.cancelText}>취소</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity onPressIn={drag} disabled={isActive} hitSlop={10} style={styles.dragHandle}>
                <Ionicons name="reorder-three-outline" size={20} color={Colors.gray300} />
              </TouchableOpacity>
              <Text style={styles.rowTitle}>{item.title}</Text>
              {segment === 'weekday' && item.weekday != null && (
                <Text style={styles.rowWeekday}>{WEEKDAY_LABELS[item.weekday]}요일</Text>
              )}
              <TouchableOpacity onPress={() => startEdit(item.id, item.title)} hitSlop={8} style={styles.iconBtn}>
                <Ionicons name="pencil" size={15} color={Colors.gray500} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmRemove(item.id, item.title)} hitSlop={8} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={15} color={Colors.negative} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScaleDecorator>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <AppBar title="체크리스트 편집" onBack={() => router.back()} />

      <View style={styles.segmentRow}>
        {SEGMENTS.map(s => (
          <TouchableOpacity
            key={s.key}
            style={[styles.segmentTab, segment === s.key && styles.segmentTabActive]}
            onPress={() => setSegment(s.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.segmentText, segment === s.key && styles.segmentTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <DraggableFlatList
        data={orderedItems}
        keyExtractor={item => item.id}
        onDragEnd={({ data }) => handleDragEnd(data)}
        renderItem={renderItem}
        activationDistance={0}
        dragItemOverflow
        autoscrollThreshold={60}
        contentContainerStyle={styles.scroll}
        ListHeaderComponent={
          orderedItems.length > 0 ? (
            <View style={styles.hintRow}>
              <Ionicons name="information-circle-outline" size={13} color={Colors.gray400} />
              <Text style={styles.hintText}>{reordering ? '순서 저장 중...' : '핸들 아이콘을 눌러서 끌면 순서를 바꿀 수 있어요'}</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          <View style={styles.addSection}>
            {segment === 'weekday' && (
              <View style={styles.weekdayChipRow}>
                {WEEKDAY_LABELS.map((label, idx) => (
                  <TouchableOpacity
                    key={label}
                    style={[styles.weekdayChip, newWeekday === idx && styles.weekdayChipActive]}
                    onPress={() => setNewWeekday(idx)}
                  >
                    <Text style={[styles.weekdayChipText, newWeekday === idx && styles.weekdayChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Field
              label="새 항목"
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="예: 바닥 물걸레질"
            />
            <View style={styles.addButtonWrap}>
              <Button label="추가하기" variant="secondary" onPress={handleAdd} loading={saving} disabled={!newTitle.trim()} />
            </View>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  segmentRow: {
    flexDirection: 'row', gap: 4, backgroundColor: Colors.gray100,
    borderRadius: 12, padding: 3, marginHorizontal: Spacing.screenX, marginTop: 14,
  },
  segmentTab: { flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center' },
  segmentTabActive: { backgroundColor: Colors.white },
  segmentText: { fontSize: 14, fontWeight: '500', color: Colors.gray400 },
  segmentTextActive: { color: Colors.black, fontWeight: '700' },
  scroll: { padding: Spacing.screenX, paddingBottom: 40, gap: 8 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  hintText: { fontSize: 11, fontWeight: '500', color: Colors.gray400 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: Colors.gray100, borderRadius: 14, padding: 14,
    backgroundColor: Colors.white, marginBottom: 8,
  },
  rowActive: { borderColor: Colors.primary, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 6 },
  dragHandle: { marginRight: -4 },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.black },
  rowWeekday: { fontSize: 11, color: Colors.gray400 },
  iconBtn: { padding: 4 },
  editRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  editInput: { flex: 1 },
  saveText: { fontSize: 13, fontWeight: '700', color: Colors.primary, paddingBottom: 13 },
  cancelText: { fontSize: 13, fontWeight: '600', color: Colors.gray400, paddingBottom: 13 },
  addSection: { gap: 14, marginTop: 16 },
  weekdayChipRow: { flexDirection: 'row', gap: 6 },
  weekdayChip: {
    flex: 1, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.gray200, alignItems: 'center',
  },
  weekdayChipActive: { backgroundColor: Colors.black, borderColor: Colors.black },
  weekdayChipText: { fontSize: 12, fontWeight: '500', color: Colors.gray600 },
  weekdayChipTextActive: { color: Colors.white, fontWeight: '600' },
  addButtonWrap: { marginTop: 4 },
});
