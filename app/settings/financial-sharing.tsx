/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md · designed-as-app */
import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { FinancialShareScope } from '../../types';
import { useAuth } from '../../lib/contexts/AuthContext';
import { FinancialSharingChoices } from '../../lib/components/FinancialSharingChoices';
import { AppBar, Button } from '../../lib/components/ui';
import { updateFinancialSharing } from '../../lib/services/stores';
import { clearQueryData } from '../../lib/query/client';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';
import { FINANCIAL_SHARE_OPTIONS } from '../../lib/utils/financialSharing';

export default function FinancialSharingScreen() {
  const { store, user, refreshStore, devPreviewMode } = useAuth();
  const [value, setValue] = useState<FinancialShareScope | null>(store?.financial_share_scope ?? null);
  const [applied, setApplied] = useState<FinancialShareScope | null>(store?.financial_share_scope ?? null);
  const [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const lastWrite = useRef<{ storeId: string; scope: FinancialShareScope } | null>(null);
  useEffect(() => {
    setValue(store?.financial_share_scope ?? null); setApplied(store?.financial_share_scope ?? null); setError(null);
    if (lastWrite.current?.storeId !== store?.id || lastWrite.current?.scope !== store?.financial_share_scope) {
      setSaved(false); setRefreshFailed(false); lastWrite.current = null;
    }
  }, [store?.id, store?.financial_share_scope]);
  const owner = !!store && store.owner_id === user?.id && devPreviewMode === 'self';
  const dirty = value !== applied;
  useConfirmLeave(owner && (dirty || saving), { blockLeave: saving });
  const titleFor = (scope: FinancialShareScope | null) => FINANCIAL_SHARE_OPTIONS.find(option => option.value === scope)?.title ?? '확인 필요';
  async function save() {
    if (!store || !owner || !value || !dirty || saving) return;
    const id = store.id;
    setSaving(true); setError(null); setSaved(false); setRefreshFailed(false);
    try {
      await updateFinancialSharing(id, value);
    } catch { setError('공유 설정을 저장하지 못했어요. 선택한 내용을 유지했으니 다시 시도해주세요.'); setSaving(false); return; }
    // The write succeeded. A later cache/read failure must not invite a second write.
    lastWrite.current = { storeId: id, scope: value };
    setApplied(value); setSaved(true);
    try { await clearQueryData(); await refreshStore(); }
    catch { setRefreshFailed(true); }
    finally { setSaving(false); }
  }
  return <SafeAreaView style={styles.page}>
    <AppBar title="손익 공유" onBack={() => router.back()} />
    {!owner ? <Text style={styles.restricted}>매장 소유자만 공유 대상을 변경할 수 있어요.</Text> : <>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.context}><Text style={styles.store}>{store.name}</Text><Text style={styles.body}>적용 중 · {titleFor(applied)}</Text></View>
        <View style={styles.intro}><Text style={styles.heading}>매장 손익을 누구와 공유할까요?</Text><Text style={styles.body}>선택한 구성원에게 손익 요약과 영업이익을 보여줘요.</Text></View>
        <FinancialSharingChoices value={value} onChange={next => { setValue(next); setSaved(false); setError(null); }} disabled={saving} />
        <View style={styles.notice}><Text style={styles.noteTitle}>공유 범위가 바뀌어도</Text><Text style={styles.body}>체크리스트·스케줄·본인 급여·재고 업무는 계속 이용할 수 있어요. 고용형태는 관리자가 확정한 직원 정보를 기준으로 적용해요.</Text></View>
        {error && <View style={styles.error} accessibilityRole="alert"><Text style={styles.body}>{error}</Text></View>}
        {saved && <Text accessibilityRole="alert" style={styles.body}>{refreshFailed ? '설정은 저장됐어요. 화면 갱신이 지연되고 있어요. 다시 진입해 적용 상태를 확인해주세요.' : '공유 설정을 저장했어요.'}</Text>}
      </ScrollView><View style={styles.footer}><Text style={styles.footerHint}>{dirty ? `저장 후 · ${titleFor(value)}` : '현재 적용 중인 설정이에요'}</Text><Button label="공유 설정 저장" disabled={!value || !dirty || saving} loading={saving} onPress={save} /></View>
    </>}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.homeCanvas }, content: { padding: 20, gap: 20, paddingBottom: 32 },
  context: { padding: 16, borderRadius: 16, backgroundColor: Colors.contextBg, gap: 6 }, store: { fontSize: 15, fontWeight: '700', color: Colors.black },
  intro: { gap: 8 }, heading: { fontSize: 24, lineHeight: 33, fontWeight: '700', color: Colors.black }, body: { fontSize: 14, color: Colors.gray600, lineHeight: 22 },
  notice: { padding: 16, borderRadius: 16, backgroundColor: Colors.taskBg, gap: 8 }, noteTitle: { fontSize: 14, fontWeight: '700', color: Colors.black },
  error: { padding: 16, borderRadius: 12, backgroundColor: Colors.fieldErrorBg }, footer: { padding: 20, gap: 10, borderTopWidth: 1, borderTopColor: Colors.homeBorder, backgroundColor: Colors.white }, footerHint: { fontSize: 13, color: Colors.gray600 }, restricted: { padding: 24, color: Colors.gray600 },
});
