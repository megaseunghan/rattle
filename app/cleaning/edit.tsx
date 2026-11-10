import { entityKey } from '../../lib/utils/listKeys';
import { getErrorMessage } from '../../lib/utils/error';
import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ActivityIndicator, AppState } from 'react-native';
import type { ViewToken } from 'react-native';
import type { FlatList } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { AppIcon } from '../../lib/icons/AppIcon';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { useQueryScope } from '../../lib/query';
import { useAuth } from '../../lib/contexts/AuthContext';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { useCleaningChecklist } from '../../lib/hooks/useCleaningChecklist';
import { CleaningItem, CleaningSegment } from '../../types';

const SEGMENTS: { key: CleaningSegment; label: string }[] = [
  { key: 'open', label: '오픈' }, { key: 'close', label: '마감' }, { key: 'weekday', label: '요일별' },
];
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
type Draft = { title: string; weekday: number };
const emptyDrafts = (): Record<CleaningSegment, Draft> => ({ open: { title: '', weekday: 0 }, close: { title: '', weekday: 0 }, weekday: { title: '', weekday: 0 } });

export default function CleaningEditScreen() {
  const scope = useQueryScope();
  const { store } = useAuth();
  const editorScope = JSON.stringify([scope, store?.id]);
  return <CleaningEditor key={editorScope} scope={editorScope} />;
}

function CleaningEditor({ scope }: { scope: string }) {
  const { items, itemsReady, error, refetch, addItem, editItem, removeItem, reorder } = useCleaningChecklist();
  const listRef = useRef<FlatList<CleaningItem>>(null);
  const addInput = useRef<TextInput>(null);
  const mounted = useRef(true), mutation = useRef(false), dragging = useRef(false);
  const dragSnapshot = useRef<CleaningItem[]>([]);
  const dragRevisionRef = useRef(0);
  const scrollTarget = useRef<{ id: string; index: number; retries: number } | null>(null);
  const scrollRetry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addedContext = useRef<{ scope: string; segment: CleaningSegment } | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [segment, setSegment] = useState<CleaningSegment>('open');
  const [orderedItems, setOrderedItems] = useState<CleaningItem[]>([]);
  const orderedItemsRef = useRef(orderedItems); orderedItemsRef.current = orderedItems;
  const [drafts, setDrafts] = useState(emptyDrafts);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [pending, setPending] = useState<'add' | 'edit' | 'delete' | 'reorder' | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [dragRevision, setDragRevision] = useState(0);
  const [writeError, setWriteError] = useState<string | null>(null);
  const busy = pending !== null || dragActive;
  const draft = drafts[segment];
  const patchDraft = (patch: Partial<Draft>) => setDrafts(previous => ({ ...previous, [segment]: { ...previous[segment], ...patch } }));
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' && dragging.current) {
        dragging.current = false;
        setOrderedItems(dragSnapshot.current);
        dragSnapshot.current = [];
        setDragActive(false);
        // Reset only the interrupted native drag, never during an active touch.
        dragRevisionRef.current += 1;
        setDragRevision(dragRevisionRef.current);
      }
    });
    return () => { mounted.current = false; dragging.current = false; dragSnapshot.current = []; subscription.remove(); if (scrollRetry.current) clearTimeout(scrollRetry.current); };
  }, []);
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));
  useEffect(() => { if (!dragging.current && !mutation.current) setOrderedItems(items.filter(i => i.segment === segment).sort((a, b) => a.sort_order - b.sort_order)); }, [items, segment]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<CleaningItem>[] }) => {
    if (scrollTarget.current && viewableItems.some(row => row.item.id === scrollTarget.current?.id)) {
      scrollTarget.current = null;
      if (scrollRetry.current) clearTimeout(scrollRetry.current);
      setAddedId(null);
    }
  }, []);
  useEffect(() => {
    if (!addedId) return;
    const clearTarget = () => { if (scrollRetry.current) clearTimeout(scrollRetry.current); scrollTarget.current = null; setAddedId(null); };
    if (addedContext.current?.scope !== scope || addedContext.current?.segment !== segment) { clearTarget(); return; }
    const index = orderedItems.findIndex(item => item.id === addedId);
    if (index < 0) { if (scrollTarget.current?.id === addedId) clearTarget(); return; }
    if (scrollRetry.current) clearTimeout(scrollRetry.current);
    scrollTarget.current = { id: addedId, index, retries: 0 };
    const frame = requestAnimationFrame(() => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.2 }));
    return () => cancelAnimationFrame(frame);
  }, [addedId, orderedItems, scope, segment]);

  function begin(kind: NonNullable<typeof pending>) {
    if (!mounted.current || mutation.current || dragging.current || !itemsReady) return false;
    mutation.current = true; setPending(kind); setWriteError(null); return true;
  }
  function finish() { mutation.current = false; if (mounted.current) setPending(null); }
  async function handleAdd() {
    const title = draft.title.trim();
    if (!title || editingId || !begin('add')) return;
    const submittedSegment = segment;
    try {
      const added = await addItem(submittedSegment, title, submittedSegment === 'weekday' ? draft.weekday : null);
      if (!mounted.current) return;
      setDrafts(previous => ({ ...previous, [submittedSegment]: { ...previous[submittedSegment], title: '' } }));
      // Keep the footer open and the keyboard available for consecutive additions.
      setOrderedItems(previous => [...previous.filter(item => item.id !== added.id), added].sort((a, b) => a.sort_order - b.sort_order));
      addedContext.current = { scope, segment: submittedSegment }; setAddedId(added.id);
      requestAnimationFrame(() => { if (mounted.current) addInput.current?.focus(); });
    } catch (e) { if (mounted.current) setWriteError(getErrorMessage(e, '항목을 추가하지 못했어요. 입력은 유지했어요.')); }
    finally { finish(); }
  }
  function startEdit(item: CleaningItem) {
    if (mutation.current || dragging.current || editingId) return;
    setMenuId(null); setEditingId(item.id); setEditingTitle(item.title); setWriteError(null);
  }
  async function handleSaveEdit() {
    const title = editingTitle.trim(), id = editingId;
    if (!id || !title || !begin('edit')) return;
    try {
      await editItem(id, title);
      if (mounted.current) { setOrderedItems(previous => previous.map(item => item.id === id ? { ...item, title } : item)); setEditingId(null); }
    } catch (e) { if (mounted.current) setWriteError(getErrorMessage(e, '수정하지 못했어요. 입력은 유지했어요.')); }
    finally { finish(); }
  }
  function confirmRemove(item: CleaningItem) {
    if (mutation.current || dragging.current || editingId) return;
    Alert.alert('항목 삭제', `"${item.title}" 항목을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        if (!mounted.current || !begin('delete')) return;
        try { await removeItem(item.id); if (mounted.current) { setOrderedItems(previous => previous.filter(row => row.id !== item.id)); setMenuId(null); } }
        catch (e) { if (mounted.current) setWriteError(getErrorMessage(e, '삭제하지 못했어요. 목록은 유지했어요.')); }
        finally { finish(); }
      } },
    ]);
  }
  async function saveOrder(data: CleaningItem[], original: CleaningItem[]) {
    if (!begin('reorder')) return;
    setOrderedItems(data); setMenuId(null);
    try { await reorder(data); }
    catch (e) { if (mounted.current) { setOrderedItems(original); setWriteError(getErrorMessage(e, '순서를 저장하지 못했어요. 이전 순서로 돌렸어요.')); } }
    finally { finish(); }
  }
  function handleDragEnd(data: CleaningItem[], revision: number) {
    if (!mounted.current || !dragging.current || revision !== dragRevisionRef.current) return;
    const original = dragSnapshot.current;
    dragging.current = false; dragSnapshot.current = []; setDragActive(false);
    const ids = new Set(original.map(item => item.id));
    if (data.length !== original.length || new Set(data.map(item => item.id)).size !== ids.size || data.some(item => !ids.has(item.id))) {
      setOrderedItems(original); return;
    }
    void saveOrder(data, original);
  }
  function moveItem(item: CleaningItem, delta: number) {
    if (mutation.current || dragging.current || editingId) return;
    const current = orderedItemsRef.current, index = current.findIndex(row => row.id === item.id), target = index + delta;
    if (index < 0 || target < 0 || target >= current.length) return;
    const next = [...current]; [next[index], next[target]] = [next[target], next[index]];
    void saveOrder(next, current);
  }
  const listExtraData = useMemo(() => ({ editingId, editingTitle, segment, busy, menuId }), [editingId, editingTitle, segment, busy, menuId]);
  const renderItem = ({ item, drag, isActive }: RenderItemParams<CleaningItem>) => {
    const editing = editingId === item.id;
    return <ScaleDecorator><View>
      <View testID={`cleaning-edit-row-${item.id}`} style={[styles.row, isActive && styles.rowActive]}>
        <TouchableOpacity disabled={pending !== null || editingId !== null} onPressIn={() => { if (!mutation.current && !editingId) drag(); }} style={styles.dragHandle}
          accessibilityRole="button" accessibilityLabel={`${item.title} 순서 이동`} accessibilityHint="누른 채 위아래로 끌거나 더보기에서 순서를 바꿔요"
          accessibilityState={{ disabled: pending !== null || editingId !== null }} accessibilityActions={[{ name: 'increment', label: '아래로 이동' }, { name: 'decrement', label: '위로 이동' }]}
          onAccessibilityAction={({ nativeEvent }) => { if (nativeEvent.actionName === 'increment') moveItem(item, 1); if (nativeEvent.actionName === 'decrement') moveItem(item, -1); }}>
          <View accessible={false} style={styles.dots}>{[0, 1, 2].map(i => <View key={i} style={styles.dotPair}><View style={styles.dot} /><View style={styles.dot} /></View>)}</View>
        </TouchableOpacity>
        {editing ? <View style={styles.inline}>
          <TextInput autoFocus accessibilityLabel="항목명" value={editingTitle} onChangeText={setEditingTitle} editable={!busy} style={styles.input} selectTextOnFocus returnKeyType="done" onSubmitEditing={() => { void handleSaveEdit(); }} />
          <TouchableOpacity disabled={busy} onPress={() => { setEditingId(null); setWriteError(null); }} style={styles.textButton} accessibilityRole="button" accessibilityLabel="항목명 수정 취소"><Text style={styles.cancelText}>취소</Text></TouchableOpacity>
          <TouchableOpacity disabled={busy || !editingTitle.trim()} onPress={() => { void handleSaveEdit(); }} style={[styles.textButton, styles.saveButton, (busy || !editingTitle.trim()) && styles.disabled]} accessibilityRole="button" accessibilityLabel="항목명 저장">
            {pending === 'edit' ? <ActivityIndicator size="small" color={Colors.action} /> : <Text style={styles.saveText}>저장</Text>}
          </TouchableOpacity>
        </View> : <>
          <TouchableOpacity disabled={busy || editingId !== null} onPress={() => startEdit(item)} style={styles.titleButton} accessibilityRole="button" accessibilityLabel={`${item.title} 수정`}>
            <Text style={styles.rowTitle}>{item.title}</Text>{segment === 'weekday' && item.weekday != null && <Text style={styles.rowWeekday}>{WEEKDAY_LABELS[item.weekday]}요일</Text>}
          </TouchableOpacity>
          <TouchableOpacity disabled={busy || editingId !== null} onPress={() => setMenuId(previous => previous === item.id ? null : item.id)} style={styles.textButton} accessibilityRole="button" accessibilityLabel={`${item.title} 더보기`} accessibilityState={{ expanded: menuId === item.id, disabled: busy || editingId !== null }}><AppIcon name="ellipsis-horizontal" size={18} color={Colors.gray600} /></TouchableOpacity>
        </>}
      </View>
      {menuId === item.id && !editing && <View style={styles.menu}>
        <TouchableOpacity disabled={busy || orderedItems[0]?.id === item.id} onPress={() => moveItem(item, -1)} style={styles.textButton} accessibilityRole="button" accessibilityLabel={`${item.title} 위로`}><Text style={styles.cancelText}>위로</Text></TouchableOpacity>
        <TouchableOpacity disabled={busy || orderedItems[orderedItems.length - 1]?.id === item.id} onPress={() => moveItem(item, 1)} style={styles.textButton} accessibilityRole="button" accessibilityLabel={`${item.title} 아래로`}><Text style={styles.cancelText}>아래로</Text></TouchableOpacity>
        <TouchableOpacity disabled={busy} onPress={() => confirmRemove(item)} style={styles.textButton} accessibilityRole="button" accessibilityLabel={`${item.title} 삭제`}><Text style={styles.deleteText}>삭제</Text></TouchableOpacity>
      </View>}
    </View></ScaleDecorator>;
  };
  return <SafeAreaView style={styles.container}>
    <View style={styles.header}><TouchableOpacity onPress={() => router.back()} style={styles.textButton} accessibilityRole="button" accessibilityLabel="뒤로가기"><AppIcon name="chevron-back" size={20} color={Colors.gray700} /></TouchableOpacity><Text style={styles.headerTitle}>체크리스트 편집</Text></View>
    <View style={styles.segmentRow} accessibilityRole="tablist">
      {SEGMENTS.map(s => <TouchableOpacity key={s.key} disabled={busy || editingId !== null} style={[styles.segmentTab, segment === s.key && styles.segmentTabActive]} onPress={() => { setSegment(s.key); setMenuId(null); setWriteError(null); }} accessibilityRole="tab" accessibilityLabel={s.label} accessibilityState={{ selected: segment === s.key, disabled: busy || editingId !== null }}><Text style={[styles.segmentText, segment === s.key && styles.segmentTextActive]}>{s.label}</Text></TouchableOpacity>)}
    </View>
    {(error || writeError) && <ErrorMessage message={writeError ?? error!} onRetry={() => { void refetch(); }} />}
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <DraggableFlatList key={dragRevision} ref={listRef} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" onViewableItemsChanged={onViewableItemsChanged}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          const target = scrollTarget.current;
          if (!target || target.index !== index || target.retries >= 3) return;
          target.retries += 1; listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
          if (scrollRetry.current) clearTimeout(scrollRetry.current);
          scrollRetry.current = setTimeout(() => {
            if (scrollTarget.current !== target) return;
            const currentIndex = orderedItemsRef.current.findIndex(item => item.id === target.id);
            if (currentIndex < 0) { scrollTarget.current = null; setAddedId(null); return; }
            target.index = currentIndex; listRef.current?.scrollToIndex({ index: currentIndex, animated: true, viewPosition: 0.2 });
          }, 100);
        }}
        initialNumToRender={5} maxToRenderPerBatch={10} windowSize={5} data={orderedItems} keyExtractor={entityKey}
        onDragBegin={() => { if (!mounted.current || mutation.current || editingId || dragRevision !== dragRevisionRef.current) return; dragging.current = true; dragSnapshot.current = [...orderedItemsRef.current]; setDragActive(true); setMenuId(null); }}
        onDragEnd={({ data }) => handleDragEnd(data, dragRevision)} extraData={listExtraData} renderItem={renderItem} activationDistance={0} dragItemOverflow autoscrollThreshold={60} contentContainerStyle={styles.scroll}
        ListHeaderComponent={pending === 'reorder' ? <Text style={styles.hintText}>순서 저장 중...</Text> : null}
        ListFooterComponent={<View style={styles.addSection}>
          {addOpen ? <>
            <View style={styles.addRow}><TextInput ref={addInput} accessibilityLabel="새 항목" placeholder="새 항목명" placeholderTextColor={Colors.gray500} value={draft.title} onChangeText={title => patchDraft({ title })} editable={!busy && !editingId} style={styles.input} returnKeyType="done" onSubmitEditing={() => { void handleAdd(); }} />
              <TouchableOpacity disabled={busy || editingId !== null} onPress={() => { patchDraft({ title: '' }); setAddOpen(false); setWriteError(null); }} style={styles.textButton} accessibilityRole="button" accessibilityLabel="항목 추가 취소"><Text style={styles.cancelText}>취소</Text></TouchableOpacity>
              <TouchableOpacity disabled={busy || !!editingId || !draft.title.trim() || !itemsReady} onPress={() => { void handleAdd(); }} style={[styles.textButton, styles.saveButton, (busy || !!editingId || !draft.title.trim() || !itemsReady) && styles.disabled]} accessibilityRole="button" accessibilityLabel="항목 추가">
                {pending === 'add' ? <ActivityIndicator size="small" color={Colors.action} /> : <Text style={styles.saveText}>추가</Text>}
              </TouchableOpacity>
            </View>
            {segment === 'weekday' && <View style={styles.weekdayRow} accessibilityRole="radiogroup" accessibilityLabel="발생 요일">{WEEKDAY_LABELS.map((label, idx) => <TouchableOpacity key={label} disabled={busy || editingId !== null} onPress={() => patchDraft({ weekday: idx })} style={[styles.weekdayButton, draft.weekday === idx && styles.weekdaySelected]} accessibilityRole="radio" accessibilityLabel={`${label}요일`} accessibilityState={{ checked: draft.weekday === idx, disabled: busy || editingId !== null }}><Text style={[styles.weekdayText, draft.weekday === idx && styles.saveText]}>{label}</Text></TouchableOpacity>)}</View>}
          </> : <TouchableOpacity disabled={busy || editingId !== null || !itemsReady} onPress={() => { setAddOpen(true); setMenuId(null); requestAnimationFrame(() => addInput.current?.focus()); }} style={styles.addTrigger} accessibilityRole="button" accessibilityLabel="항목 추가 열기"><Text style={styles.addText}>＋ 항목 추가</Text></TouchableOpacity>}
          <Text style={styles.hintText}>항목명을 눌러 수정 · 손잡이를 끌어 순서 변경</Text>
        </View>}
      />
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' }, flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: 56 }, headerTitle: { fontFamily: Fonts.wantedMedium, fontSize: 18, color: Colors.black },
  segmentRow: { flexDirection: 'row', gap: 8, marginHorizontal: 20, marginTop: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8EDF3' },
  segmentTab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' }, segmentTabActive: { borderBottomColor: Colors.action },
  segmentText: { fontFamily: Fonts.wantedMedium, fontSize: 13, color: Colors.gray600 }, segmentTextActive: { color: Colors.action },
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8EDF3' }, rowActive: { backgroundColor: Colors.taskBg },
  dragHandle: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, dots: { gap: 3 }, dotPair: { flexDirection: 'row', gap: 3 }, dot: { width: 2.5, height: 2.5, borderRadius: 1.25, backgroundColor: Colors.gray500 },
  titleButton: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 6 }, rowTitle: { fontFamily: Fonts.wantedMedium, fontSize: 13, lineHeight: 19, color: Colors.black }, rowWeekday: { fontFamily: Fonts.wantedRegular, fontSize: 11, lineHeight: 16, color: Colors.gray600, marginTop: 2 },
  inline: { flex: 1, minWidth: 0, minHeight: 63, flexDirection: 'row', alignItems: 'center', gap: 2 }, input: { flex: 1, minWidth: 0, minHeight: 40, paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: Colors.homeBorder, fontFamily: Fonts.wantedRegular, fontSize: 13, color: Colors.black },
  textButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }, saveButton: { borderRadius: 10, backgroundColor: '#E8F0FC' }, saveText: { fontFamily: Fonts.wantedMedium, fontSize: 12, color: Colors.action }, cancelText: { fontFamily: Fonts.wantedRegular, fontSize: 12, color: Colors.gray600 }, deleteText: { fontFamily: Fonts.wantedRegular, fontSize: 12, color: Colors.negative }, disabled: { opacity: 0.45 },
  menu: { flexDirection: 'row', justifyContent: 'flex-end', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8EDF3' },
  addSection: { marginTop: 8 }, addTrigger: { minHeight: 44, justifyContent: 'center', paddingVertical: 10 }, addText: { fontFamily: Fonts.wantedMedium, fontSize: 13, color: Colors.action }, addRow: { minHeight: 64, paddingLeft: 44, flexDirection: 'row', alignItems: 'center', gap: 2 },
  hintText: { fontFamily: Fonts.wantedRegular, fontSize: 11, lineHeight: 17, color: Colors.gray600, paddingVertical: 12 }, weekdayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, paddingLeft: 44, paddingVertical: 6 }, weekdayButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 }, weekdaySelected: { backgroundColor: Colors.taskBg }, weekdayText: { fontFamily: Fonts.wantedRegular, fontSize: 12, color: Colors.gray600 },
});
