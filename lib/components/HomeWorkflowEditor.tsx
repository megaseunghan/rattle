import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { ReduceMotion } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import type { HomeActionId, HomePhase, HomeWorkflow } from '../../types';
import { useAuth } from '../contexts/AuthContext';
import { useHomeWorkflow } from '../hooks/useHomeWorkflow';
import { homeWorkflowLoadMessage, saveHomeWorkflow } from '../services/homeWorkflow';
import { DEFAULT_HOME_WORKFLOW, HOME_ACTIONS, HOME_PHASES } from '../utils/homeWorkflow';
import { getErrorMessage } from '../utils/error';
import { AppIcon } from '../icons/AppIcon';
import { Illustration } from '../icons/Illustration';
import { homeActionIllustrations } from '../icons/homeActionIllustrations';
import { SheetModal } from './ui/SheetModal';

const phaseNames: Record<HomePhase, string> = { open: '오픈', business: '영업 중', close: '마감' };
const selectedBackground = '#E0EDFF';
const phasePalette: Record<HomePhase, { background: string; text: string }> = {
  open: { background: '#DCEFF0', text: '#245D67' },
  business: { background: '#DCE8FF', text: '#185BC7' },
  close: { background: '#ECE6F4', text: '#62517F' },
};
const copy = (value: HomeWorkflow): HomeWorkflow => ({ open: [...value.open], business: [...value.business], close: [...value.close] });
type RemovedAction = { id: HomeActionId; phase: HomePhase; index: number };
type DragSnapshot = { scope: string; phase: HomePhase; generation: number; version: number; ids: HomeActionId[] };
const sameMembers = (a: HomeActionId[], b: HomeActionId[]) => a.length === b.length && new Set(a).size === a.length && a.every(id => b.includes(id));

/** Edits only the existing fixed action catalog, using the existing store configuration contract. */
export function HomeWorkflowEditor({ visible, initialPhase, onClose, onStateChange }: { visible: boolean; initialPhase: HomePhase; onClose: () => void; onStateChange?: (state: { dirty: boolean; busy: boolean }) => void }) {
  const { user, store, currentRole, devPreviewMode } = useAuth();
  const insets = useSafeAreaInsets();
  const query = useHomeWorkflow(visible);
  const canEdit = currentRole === 'admin' && devPreviewMode === 'self' && !!store;
  const scope = JSON.stringify([user?.id, store?.id, currentRole, devPreviewMode]);
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const visibleRef = useRef(visible); visibleRef.current = visible;
  const [draft, setDraft] = useState<HomeWorkflow | null>(null);
  const [draftScope, setDraftScope] = useState('');
  const [baseline, setBaseline] = useState<string | null>(null);
  const [phase, setPhase] = useState<HomePhase>(initialPhase);
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [listVersion, setListVersion] = useState(0);
  const [lastRemoved, setLastRemoved] = useState<RemovedAction | null>(null);
  const [saveError, setSaveError] = useState('');
  const inFlight = useRef(false);
  const dragSnapshot = useRef<DragSnapshot | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; dragSnapshot.current = null; }, []);
  useEffect(() => {
    generation.current += 1; dragSnapshot.current = null;
    setDragging(false); setLastRemoved(null); setListVersion(version => version + 1);
    setDraft(null); setBaseline(null); setPhase(initialPhase); setSaveError('');
  }, [visible, scope, initialPhase]);
  useEffect(() => {
    if (!visible || !canEdit || !query.isSuccess) return;
    const configuration = query.data ?? DEFAULT_HOME_WORKFLOW;
    setDraftScope(scope); setDraft(previous => previous ?? copy(configuration));
    setBaseline(previous => previous ?? JSON.stringify(configuration));
  }, [visible, canEdit, scope, query.isSuccess, query.data, initialPhase]);
  function cancelDrag() {
    if (!dragSnapshot.current) return;
    dragSnapshot.current = null; setDragging(false);
    // The installed drag list does not expose a gesture-cancel callback. Remount
    // its native gesture state so cancelled/late spring completions cannot commit.
    setListVersion(version => version + 1);
  }
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') cancelDrag(); });
    return () => subscription.remove();
  }, []);
  const current = draftScope === scope ? draft : null;
  const dirty = current !== null && baseline !== null && JSON.stringify(current) !== baseline;
  const locked = busy || dragging;
  const editable = canEdit && !!current && !locked;
  useEffect(() => { onStateChange?.({ dirty: visible && dirty, busy: locked }); }, [onStateChange, visible, dirty, locked]);
  function requestClose() {
    if (inFlight.current || dragSnapshot.current) return;
    if (!dirty) { setLastRemoved(null); onClose(); return; }
    const requestScope = scopeRef.current, requestGeneration = generation.current;
    Alert.alert('변경을 취소할까요?', '저장하지 않은 구성은 반영되지 않아요.', [
      { text: '계속 편집', style: 'cancel' },
      { text: '변경 취소', style: 'destructive', onPress: () => {
        if (!inFlight.current && !dragSnapshot.current && requestScope === scopeRef.current && requestGeneration === generation.current) { setLastRemoved(null); onClose(); }
      } },
    ]);
  }
  function toggle(id: HomeActionId) {
    if (!editable || dragSnapshot.current) return;
    const selected = current![phase], index = selected.indexOf(id);
    if (index >= 0) {
      setLastRemoved({ id, phase, index });
      AccessibilityInfo.announceForAccessibility(`${HOME_ACTIONS.find(action => action.id === id)!.label} 표시 해제. 실행 취소할 수 있어요.`);
    }
    setSaveError(''); setDraft(previous => previous ? { ...previous, [phase]: previous[phase].includes(id) ? previous[phase].filter(item => item !== id) : [...previous[phase], id] } : previous);
  }
  function undoRemoval() {
    if (!editable || dragSnapshot.current || !lastRemoved) return;
    const removed = lastRemoved;
    setDraft(previous => {
      if (!previous || previous[removed.phase].includes(removed.id)) return previous;
      const list = [...previous[removed.phase]];
      list.splice(Math.min(removed.index, list.length), 0, removed.id);
      return { ...previous, [removed.phase]: list };
    });
    setLastRemoved(null); setSaveError('');
  }
  function move(id: HomeActionId, offset: number) {
    if (!editable || dragSnapshot.current) return;
    setSaveError(''); setDraft(previous => {
      if (!previous) return previous;
      const list = [...previous[phase]], index = list.indexOf(id), next = index + offset;
      if (index < 0 || next < 0 || next >= list.length) return previous;
      [list[index], list[next]] = [list[next], list[index]];
      return { ...previous, [phase]: list };
    });
  }
  function startDrag(drag: () => void) {
    if (!editable || !current || dragSnapshot.current) return;
    dragSnapshot.current = { scope, phase, generation: generation.current, version: listVersion, ids: [...current[phase]] };
    setDragging(true); drag();
  }
  // Capture the rendered list's identity; an old list can finish after cancellation,
  // a phase switch, or a new account without touching the replacement list's draft.
  const renderedScope = scope, renderedPhase = phase, renderedVersion = listVersion;
  function finishDrag(data: HomeActionId[]) {
    const snapshot = dragSnapshot.current;
    if (!snapshot || snapshot.scope !== renderedScope || snapshot.phase !== renderedPhase || snapshot.version !== renderedVersion) return;
    dragSnapshot.current = null; setDragging(false);
    if (!visibleRef.current || snapshot.scope !== scopeRef.current || snapshot.phase !== phaseRef.current || snapshot.generation !== generation.current || !sameMembers(data, snapshot.ids)) return;
    setDraft(previous => {
      if (!previous || !sameMembers(previous[snapshot.phase], snapshot.ids)) return previous;
      return { ...previous, [snapshot.phase]: [...data] };
    });
    setSaveError('');
  }
  async function save() {
    if (!current || !store || !canEdit || query.isError || inFlight.current || dragSnapshot.current) return;
    const requestScope = scope, requestGeneration = generation.current;
    inFlight.current = true; setBusy(true); setLastRemoved(null); setSaveError('');
    try {
      await saveHomeWorkflow(store.id, copy(current));
      if (scopeRef.current === requestScope && generation.current === requestGeneration) onClose();
    } catch (error) {
      if (scopeRef.current === requestScope && generation.current === requestGeneration) setSaveError(getErrorMessage(error, '저장하지 못했어요. 선택한 구성은 유지했어요.'));
    } finally { inFlight.current = false; setBusy(false); }
  }
  function renderOrderItem({ item: id, drag, isActive }: RenderItemParams<HomeActionId>) {
    const action = HOME_ACTIONS.find(item => item.id === id)!;
    return <View style={[styles.orderRow, isActive && styles.lifted]}>
      <Illustration name={homeActionIllustrations[id]} size={48} /><Text style={styles.actionName}>{action.label}</Text>
      <Pressable accessibilityRole="adjustable" accessibilityLabel={`${action.label} 순서 이동`} accessibilityHint="누른 채 위아래로 끌어 순서를 바꿔요"
        accessibilityState={{ disabled: locked }} accessibilityActions={[{ name: 'increment', label: '아래로 이동' }, { name: 'decrement', label: '위로 이동' }]}
        onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'increment') move(id, 1); else if (event.nativeEvent.actionName === 'decrement') move(id, -1); }}
        disabled={locked} onPressIn={() => startDrag(drag)} style={styles.dragHandle}>
        <Svg width={20} height={22} viewBox="0 0 20 22" accessible={false}>
          {[6, 14].flatMap(x => [5, 11, 17].map(y => <Circle key={`${x}-${y}`} cx={x} cy={y} r={1.5} fill={Colors.gray600} />))}
        </Svg>
      </Pressable>
    </View>;
  }
  const catalog = current ? <View>
    <Text style={styles.catalogTitle}>표시할 기능</Text>
    {HOME_ACTIONS.map(action => {
      const checked = current[phase].includes(action.id);
      const assigned = HOME_PHASES.filter(item => current[item.id].includes(action.id));
      return <Pressable key={action.id} accessibilityRole="checkbox" accessibilityLabel={action.label} accessibilityHint={assigned.length ? `배치 구간: ${assigned.map(item => phaseNames[item.id]).join(', ')}` : undefined} accessibilityState={{ checked, disabled: locked }} disabled={locked} onPress={() => toggle(action.id)} style={({ pressed }) => [styles.catalogRow, checked && styles.selectedCatalogRow, pressed && styles.pressed]}>
        <Illustration name={homeActionIllustrations[action.id]} size={48} /><View style={styles.catalogText}><Text style={styles.catalogName}>{action.label}</Text>{assigned.length > 0 && <View style={styles.chips} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{assigned.map(item => <View key={item.id} style={[styles.chip, { backgroundColor: phasePalette[item.id].background }]}><Text style={[styles.chipText, { color: phasePalette[item.id].text }]}>{phaseNames[item.id]}</Text></View>)}</View>}</View>
        <View style={[styles.check, checked && styles.checked]}>{checked && <AppIcon name="checkmark" size={14} color={Colors.white} />}</View>
      </Pressable>;
    })}
    {!!saveError && <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text>}
  </View> : null;
  return <SheetModal visible={visible} onRequestClose={requestClose}>
    <View style={styles.overlay}>
      <GestureHandlerRootView style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">{phaseNames[phase]} 바로가기 편집</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="바로가기 편집 닫기" accessibilityState={{ disabled: locked }} disabled={locked} onPress={requestClose} style={styles.close}><AppIcon name="close" size={22} color={Colors.gray700} /></Pressable>
        </View>
        {!canEdit ? <Text style={styles.message}>홈 구성은 매장 관리자만 변경할 수 있어요.</Text> : <>
          <View style={styles.phases}>
            {HOME_PHASES.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={`${phaseNames[item.id]} 구성`} accessibilityState={{ selected: phase === item.id, disabled: locked }} disabled={locked} onPress={() => { if (!dragSnapshot.current && !inFlight.current) setPhase(item.id); }} style={[styles.phase, phase === item.id && styles.phaseSelected]}><Text style={[styles.phaseText, phase === item.id && styles.selectedText]}>{phaseNames[item.id]}</Text></Pressable>)}
          </View>
          <DraggableFlatList<HomeActionId>
            key={`${scope}:${visible}:${phase}:${listVersion}`}
            testID="바로가기 순서 목록" style={styles.list} containerStyle={styles.list}
            contentContainerStyle={styles.content} data={current?.[phase] ?? []} keyExtractor={id => id}
            renderItem={renderOrderItem} activationDistance={0} autoscrollThreshold={60}
            animationConfig={{ reduceMotion: ReduceMotion.System }}
            onDragEnd={({ data }) => finishDrag(data)}
            ListHeaderComponent={query.isError ? <View style={styles.message}><Text accessibilityRole="alert" style={styles.help}>{homeWorkflowLoadMessage(query.error)}</Text><Pressable accessibilityRole="button" accessibilityLabel="바로가기 설정 다시 불러오기" disabled={locked} onPress={() => { void query.refetch(); }} style={styles.retry}><Text style={styles.link}>다시 불러오기</Text></Pressable></View> : !current ? <View style={styles.loading}><ActivityIndicator color={Colors.action} accessibilityLabel="바로가기 설정 불러오는 중" /></View> : null}
            ListEmptyComponent={current && <Text style={styles.help}>아래에서 표시할 기능을 선택해주세요.</Text>}
            ListFooterComponent={catalog}
          />
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            {lastRemoved && <View style={styles.undoRow}><Pressable accessibilityRole="button" accessibilityLabel="바로가기 실행 취소" accessibilityHint={`${HOME_ACTIONS.find(action => action.id === lastRemoved.id)!.label}을 ${phaseNames[lastRemoved.phase]}의 원래 위치로 복원해요`} accessibilityState={{ disabled: locked }} disabled={locked} onPress={undoRemoval} style={styles.undoButton}><Text style={styles.link}>실행 취소</Text></Pressable></View>}
            <Pressable accessibilityRole="button" accessibilityLabel="바로가기 구성 저장" accessibilityState={{ disabled: !current || locked || query.isError, busy: locked }} disabled={!current || locked || query.isError} onPress={save} style={[styles.save, (!current || locked || query.isError) && styles.disabled]}>{busy ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveText}>저장</Text>}</Pressable>
          </View>
        </>}
      </GestureHandlerRootView>
    </View>
  </SheetModal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlaySheet },
  sheet: { height: '92%', backgroundColor: Colors.homeCanvas, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.gray300, marginTop: 10, alignSelf: 'center' },
  header: { paddingLeft: 20, paddingRight: 8, flexDirection: 'row', alignItems: 'center', minHeight: 64 },
  title: { flex: 1, color: Colors.black, fontSize: 20, fontFamily: Fonts.wantedSemiBold },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  phases: { marginHorizontal: 20, marginBottom: 10, borderRadius: 15, padding: 4, flexDirection: 'row', backgroundColor: Colors.glass.background },
  phase: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  phaseSelected: { backgroundColor: Colors.white }, phaseText: { color: Colors.gray600, fontSize: 14 }, selectedText: { color: Colors.action, fontFamily: Fonts.wantedSemiBold },
  list: { flex: 1 }, content: { paddingHorizontal: 20, paddingBottom: 20 }, loading: { padding: 30 }, message: { padding: 20 },
  orderRow: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 66, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.homeBorder },
  lifted: { backgroundColor: Colors.white, borderRadius: 14, paddingLeft: 12, shadowColor: Colors.black, shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  actionName: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 21, color: Colors.black },
  dragHandle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  catalogTitle: { fontSize: 12, color: Colors.gray600, marginTop: 24, marginBottom: 8 }, catalogRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, paddingVertical: 11, paddingHorizontal: 12, marginBottom: 5, borderRadius: 12 }, selectedCatalogRow: { backgroundColor: selectedBackground },
  catalogText: { flex: 1, gap: 6 }, catalogName: { fontSize: 14, color: Colors.black },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, chip: { minHeight: 22, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 7, justifyContent: 'center' }, chipText: { fontSize: 11, lineHeight: 14, fontFamily: Fonts.wantedMedium },
  check: { height: 22, width: 22, borderWidth: 1, borderColor: Colors.homeBorder, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: Colors.action, borderColor: Colors.action },
  help: { fontSize: 13, lineHeight: 21, color: Colors.gray600 }, link: { color: Colors.action, fontSize: 14 }, retry: { minHeight: 44, justifyContent: 'center' }, error: { color: Colors.danger, fontSize: 13, lineHeight: 21, marginTop: 14 },
  footer: { paddingHorizontal: 20, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.homeBorder }, save: { minHeight: 50, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.action }, saveText: { color: Colors.white, fontFamily: Fonts.wantedSemiBold, fontSize: 15 },
  undoRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 4 }, undoButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  disabled: { opacity: 0.35 }, pressed: { opacity: 0.7 },
});
