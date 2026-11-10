import { memo, useEffect, useState } from 'react';
/* design-system: DESIGN.md — a store day, from opening to closing */
import { ActivityIndicator, View, Text, Pressable, StyleSheet } from 'react-native';
import { AppIcon } from '../icons/AppIcon';
import { Illustration } from '../icons/Illustration';
import { homeActionIllustrations } from '../icons/homeActionIllustrations';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { useAuth } from '../contexts/AuthContext';
import { useTabPager } from '../contexts/TabPagerContext';
import { useDailyChecklistSummary } from '../hooks/useDailyChecklistSummary';
import { GlassCard } from './GlassCard';
import { useHomeWorkflow } from '../hooks/useHomeWorkflow';
import { homeWorkflowLoadMessage } from '../services/homeWorkflow';
import { DEFAULT_HOME_WORKFLOW, HOME_ACTIONS } from '../utils/homeWorkflow';
import { HomeActionId, HomePhase } from '../../types';
import { ErrorMessage } from './ErrorMessage';
import { HomeWorkflowEditor } from './HomeWorkflowEditor';
import { ChecklistProgress } from './ChecklistProgress';

const PHASES: { id: HomePhase; label: string }[] = [
  { id: 'open', label: '오픈' }, { id: 'business', label: '영업 중' }, { id: 'close', label: '마감' },
];
type Action = { label: string; icon: keyof typeof AppIcon.glyphMap; onPress: () => void };
export const DailyOperationsHome = memo(function DailyOperationsHome({ active, refreshKey, canUseFinancialTabs, isPartTime, isAdmin }: {
  active: boolean; refreshKey: number; canUseFinancialTabs: boolean; isPartTime: boolean; isAdmin: boolean;
}) {
  const { goToTab } = useTabPager();
  const { user, store, currentRole, devPreviewMode } = useAuth();
  const [phase, setPhase] = useState<HomePhase>('open');
  const [editorVisible, setEditorVisible] = useState(false);
  const canEdit = isAdmin && currentRole === 'admin' && devPreviewMode === 'self';
  useEffect(() => { setPhase('open'); setEditorVisible(false); }, [user?.id, store?.id, currentRole, devPreviewMode]);
  const query = useDailyChecklistSummary(active, refreshKey);
  const workflow = useHomeWorkflow(active);
  const configuration = workflow.data ?? DEFAULT_HOME_WORKFLOW;
  const checklist = (segment: 'open' | 'close') => router.push({ pathname: '/cleaning', params: { segment } });
  const status = (segment: 'open' | 'close') => {
    if (query.isError) return '확인 필요';
    const count = query.data?.[segment];
    if (!count) return '불러오는 중';
    return count.total ? `${Math.round(count.done / count.total * 100)}% 완료` : '체크 항목을 추가해요';
  };
  const actions: Record<HomeActionId, Action> = {
    open_check: { label: '오픈 체크리스트', icon: 'checkbox-outline', onPress: () => checklist('open') },
    close_check: { label: '마감 체크리스트', icon: 'checkbox-outline', onPress: () => checklist('close') },
    weekday_check: { label: '요일별 체크', icon: 'checkbox-outline', onPress: () => router.push({ pathname: '/cleaning', params: { segment: 'weekday' } }) },
    stock: { label: '재고 확인', icon: 'cube-outline', onPress: () => goToTab('stock') },
    stock_edit: { label: '재고 수량 수정', icon: 'create-outline', onPress: () => goToTab('stock') },
    schedule: { label: '내 스케줄', icon: 'calendar-outline', onPress: () => router.push('/mypage/schedule') },
    purchase: { label: '매입 등록', icon: 'cart-outline', onPress: () => router.push('/purchases/new') },
    recipes: { label: '레시피 확인', icon: 'restaurant-outline', onPress: () => router.push('/recipes') },
    sales: { label: '매출 확인', icon: 'stats-chart-outline', onPress: () => goToTab('sales') },
    expenses: { label: '비용 기록', icon: 'receipt-outline', onPress: () => router.push('/expenses') },
  };
  const ids = configuration[phase].filter(id => canUseFinancialTabs || !HOME_ACTIONS.find(a => a.id === id)?.financial);
  const shortcuts = ids.map(id => ({ ...actions[id], id, status: id === 'open_check' ? status('open') : id === 'close_check' ? status('close') : undefined }));
  const hasChecklist = ids.includes('open_check') || ids.includes('close_check');
  const personalActions: (Action & { id: string })[] = [
    { id: 'payroll', label: isAdmin ? '직원·급여' : '내 급여', icon: 'people-outline', onPress: () => isAdmin ? goToTab('payroll') : router.push('/mypage/payslip') },
    ...(isPartTime ? [{ id: 'work_minutes', label: '근무시간 제출', icon: 'time-outline' as const, onPress: () => router.push('/mypage/work-minutes') }] : []),
  ];
  return <View style={styles.root}>
    <View style={styles.header}>
      <Text style={styles.title}>바로가기</Text>
      {canEdit && <Pressable accessibilityRole="button" accessibilityLabel="매장 바로가기 구성 수정" style={styles.edit} onPress={() => setEditorVisible(true)}>
        <AppIcon name="options-outline" size={18} color={Colors.action} /><Text style={styles.editLabel}>편집</Text>
      </Pressable>}
    </View>
    <View style={styles.phases} accessibilityRole="tablist" accessibilityLabel="업무 구간">
      {PHASES.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: phase === item.id }} onPress={() => setPhase(item.id)}
        style={({ pressed }) => [styles.phase, phase === item.id && styles.phaseSelected, pressed && styles.pressed]}>
        <Text style={[styles.phaseLabel, phase === item.id && styles.phaseLabelSelected]}>{item.label}</Text>
      </Pressable>)}
    </View>
    {workflow.isError && <ErrorMessage message={`${homeWorkflowLoadMessage(workflow.error)} ${workflow.data ? '이전 구성을 유지해요.' : '기본 구성을 보여드려요.'}`} onRetry={() => { void workflow.refetch(); }} />}
    {query.isError && hasChecklist && <ErrorMessage message="체크 현황을 불러오지 못했어요." onRetry={() => { void query.refetch(); }} />}
    {workflow.isPending && !workflow.data ? <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel="바로가기 불러오는 중"><ActivityIndicator color={Colors.action} /></View> : shortcuts.length ? <View style={styles.list}>
      {shortcuts.map(action => <GlassCard key={action.id} contentStyle={styles.cardContent} style={styles.card}>
        <Pressable onPress={action.onPress} accessibilityRole="button" accessibilityLabel={`${action.label}${action.status ? `, ${action.status}` : ''}`}
          style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}>
          <Illustration name={homeActionIllustrations[action.id]} size={48} />
          <View style={styles.actionText}><Text style={styles.label}>{action.label}</Text>{action.status && (() => {
            const count = action.id === 'open_check' ? query.data?.open : action.id === 'close_check' ? query.data?.close : undefined;
            const key = JSON.stringify([user?.id, store?.id, currentRole, devPreviewMode, action.id]);
            return !query.isError && count && count.total > 0
              ? <ChecklistProgress key={key} scopeKey={key} done={count.done} total={count.total} compact />
              : <Text style={styles.status}>{action.status}</Text>;
          })()}</View>
          <AppIcon name="chevron-forward" size={16} color={Colors.gray600} accessible={false} />
        </Pressable>
      </GlassCard>)}
    </View> : <View style={styles.empty}><Text style={styles.emptyText}>이 구간에 표시할 기능이 없어요.</Text>{canEdit && <Pressable accessibilityRole="button" onPress={() => setEditorVisible(true)} style={styles.edit}><Text style={styles.editLabel}>구성 편집</Text></Pressable>}</View>}
    <View style={styles.personal}>
      {personalActions.map(action => <Pressable key={action.id} onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label}
        style={({ pressed }) => [styles.personalAction, pressed && styles.pressed]}>
        <AppIcon name={action.icon} size={17} color={Colors.gray600} accessible={false} /><Text style={styles.personalLabel}>{action.label}</Text><AppIcon name="chevron-forward" size={13} color={Colors.gray600} accessible={false} />
      </Pressable>)}
    </View>
    {canEdit && <HomeWorkflowEditor visible={editorVisible} initialPhase={phase} onClose={() => setEditorVisible(false)} />}
  </View>;
});
const styles = StyleSheet.create({
  root: { gap: 12 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: Fonts.wantedBold, fontSize: 20, color: Colors.black },
  edit: { minHeight: 44, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  editLabel: { fontSize: 13, color: Colors.action, fontFamily: Fonts.wantedMedium },
  phases: { flexDirection: 'row', padding: 4, gap: 4, backgroundColor: Colors.glass.background, borderColor: Colors.glass.border, borderWidth: 1, borderRadius: 15 },
  phase: { flex: 1, minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  phaseSelected: { backgroundColor: Colors.white }, phaseLabel: { fontFamily: Fonts.wantedMedium, fontSize: 14, color: Colors.gray600 },
  phaseLabelSelected: { fontFamily: Fonts.wantedSemiBold, color: Colors.action }, list: { gap: 8 }, cardContent: { padding: 0 }, card: { shadowOpacity: 0.025, shadowRadius: 7, shadowOffset: { width: 0, height: 3 } },
  shortcut: { minHeight: 58, paddingVertical: 4, paddingLeft: 8, paddingRight: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 15 },
  actionText: { flex: 1, gap: 3 }, label: { color: Colors.gray800, fontFamily: Fonts.wantedMedium, fontSize: 13, lineHeight: 19 },
  status: { color: Colors.gray600, fontSize: 11, lineHeight: 16 }, loading: { minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingVertical: 24, alignItems: 'center', gap: 6 }, emptyText: { fontSize: 14, color: Colors.gray600 },
  personal: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, paddingTop: 2 }, personalAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 3 },
  personalLabel: { fontFamily: Fonts.wantedMedium, fontSize: 12, color: Colors.gray600 }, pressed: { opacity: 0.7 },
});
