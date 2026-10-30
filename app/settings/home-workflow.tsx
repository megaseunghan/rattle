import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { HomeActionId, HomeWorkflow } from '../../types';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';
import { useHomeWorkflow } from '../../lib/hooks/useHomeWorkflow';
import { homeWorkflowLoadMessage, saveHomeWorkflow } from '../../lib/services/homeWorkflow';
import { DEFAULT_HOME_WORKFLOW, HOME_ACTIONS, HOME_PHASES } from '../../lib/utils/homeWorkflow';
import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { GlassCard } from '../../lib/components/GlassCard';
import { AppBar } from '../../lib/components/ui';
import { ErrorMessage } from '../../lib/components/ErrorMessage';

export default function HomeWorkflowScreen() {
  const { store, currentRole, devPreviewMode } = useAuth();
  const query = useHomeWorkflow();
  const [draft, setDraft] = useState<HomeWorkflow | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const inFlight = useRef(false);
  const identity = useRef(store?.id);
  identity.current = store?.id;
  useEffect(() => { setDraft(null); setStep(0); }, [store?.id]);
  useEffect(() => { if (query.isSuccess || query.data !== undefined) setDraft(previous => previous ?? query.data ?? DEFAULT_HOME_WORKFLOW); }, [query.isSuccess, query.data, store?.id]);
  const canEdit = currentRole === 'admin' && devPreviewMode === 'self';
  const phase = HOME_PHASES[step];
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(query.data ?? DEFAULT_HOME_WORKFLOW);
  const allowLeave = useConfirmLeave(dirty || saving, { blockLeave: saving });
  function toggle(id: HomeActionId) {
    if (!draft || !phase) return;
    const selected = draft[phase.id];
    setDraft({ ...draft, [phase.id]: selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id] });
  }
  async function save() {
    if (!store || !draft || !canEdit || query.isError || inFlight.current) return;
    const storeId = store.id;
    inFlight.current = true; setSaving(true);
    try {
      await saveHomeWorkflow(storeId, draft);
      if (identity.current === storeId) { allowLeave(); router.back(); }
    } catch { Alert.alert('저장하지 못했어요', '선택한 내용은 유지했어요. 잠시 후 다시 저장해 주세요.'); }
    finally { inFlight.current = false; setSaving(false); }
  }
  function back() { if (saving) return; if (step > 0) setStep(step - 1); else router.back(); }
  return <SafeAreaView style={styles.root}>
    <GlassBackdrop /><AppBar title="매장 홈 구성" onBack={back} />
    {!canEdit ? <Text style={styles.message}>홈 구성은 매장 관리자만 변경할 수 있어요.</Text> : query.isError && !draft ? <ErrorMessage message={homeWorkflowLoadMessage(query.error)} onRetry={() => { void query.refetch(); }} /> : !draft ? <ActivityIndicator color={Colors.primary} /> : <>
      <ScrollView contentContainerStyle={styles.scroll}>
        {query.isError && <Pressable accessibilityRole="button" onPress={() => { void query.refetch(); }}><Text style={styles.description}>{homeWorkflowLoadMessage(query.error)} · 다시 시도</Text></Pressable>}
        <Text style={styles.progress}>{step + 1} / 4 · {step < 3 ? '업무 선택' : '최종 확인'}</Text>
        <Text style={styles.title}>{phase ? `${phase.title}에 무엇을 보여줄까요?` : '매장 홈을 확인해 주세요'}</Text>
        <Text style={styles.description}>매장 구성원이 함께 쓰는 설정이에요. 각 직원에게는 사용 권한이 있는 기능만 보여요. 홈에서 언제든 다시 수정할 수 있어요.</Text>
        {phase ? <GlassCard contentStyle={styles.list}>
          {HOME_ACTIONS.map(action => { const checked = draft[phase.id].includes(action.id); return <Pressable key={action.id} onPress={() => toggle(action.id)} accessibilityRole="checkbox" accessibilityState={{ checked }} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Text style={styles.label}>{action.label}</Text><Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? Colors.action : Colors.gray600} />
          </Pressable>; })}
        </GlassCard> : HOME_PHASES.map((item, index) => <GlassCard key={item.id}>
          <View style={styles.heading}><Text style={styles.sectionTitle}>{item.title}</Text><Pressable accessibilityRole="button" accessibilityLabel={`${item.title} 수정`} onPress={() => { setReviewing(true); setStep(index); }} style={styles.edit}><Text style={styles.link}>수정</Text></Pressable></View>
          <Text style={styles.description}>{draft[item.id].map(id => HOME_ACTIONS.find(a => a.id === id)!.label).join(' · ') || '표시할 업무 없음'}</Text>
        </GlassCard>)}
        {phase && <Text style={styles.description}>선택한 순서대로 표시돼요. 선택하지 않으면 이 단계는 홈에서 숨겨져요.</Text>}
      </ScrollView>
      <View style={styles.footer}><Pressable accessibilityRole="button" disabled={saving || query.isError} onPress={step < 3 ? () => { if (reviewing) { setStep(3); setReviewing(false); } else setStep(step + 1); } : save} style={({ pressed }) => [styles.save, pressed && styles.pressed, saving && { opacity: 0.6 }]}>
        {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveText}>{step < 3 ? reviewing ? '확인으로 돌아가기' : '다음' : '매장 홈에 적용'}</Text>}
      </Pressable></View>
    </>}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.homeCanvas }, scroll: { padding: 20, gap: 16, paddingBottom: 32 },
  message: { padding: 20, color: Colors.gray700 }, progress: { fontSize: 13, color: Colors.action }, title: { fontSize: 24, fontWeight: '700', color: Colors.black },
  description: { fontSize: 14, lineHeight: 22, color: Colors.gray600 }, list: { padding: 6 }, row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, padding: 12, gap: 12 },
  label: { flex: 1, fontSize: 15, color: Colors.gray800 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: Colors.black }, edit: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' }, link: { color: Colors.action },
  footer: { padding: 16, backgroundColor: Colors.glass.background }, save: { minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.action, borderRadius: 14 },
  saveText: { color: Colors.white, fontSize: 16, fontWeight: '700' }, pressed: { opacity: 0.7 },
});
