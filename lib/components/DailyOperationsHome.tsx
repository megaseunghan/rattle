/* design-system: DESIGN.md — a store day, from opening to closing */
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { useTabPager } from '../contexts/TabPagerContext';
import { useDailyChecklistSummary } from '../hooks/useDailyChecklistSummary';
import { GlassCard } from './GlassCard';
import { useHomeWorkflow } from '../hooks/useHomeWorkflow';
import { homeWorkflowLoadMessage } from '../services/homeWorkflow';
import { DEFAULT_HOME_WORKFLOW, HOME_ACTIONS } from '../utils/homeWorkflow';
import { HomeActionId, HomePhase } from '../../types';
import { ErrorMessage } from './ErrorMessage';

type Action = { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void };
export function DailyOperationsHome({ active, refreshKey, canUseFinancialTabs, isPartTime, isAdmin }: {
  active: boolean; refreshKey: number; canUseFinancialTabs: boolean; isPartTime: boolean; isAdmin: boolean;
}) {
  const { goToTab } = useTabPager();
  const query = useDailyChecklistSummary(active, refreshKey);
  const workflow = useHomeWorkflow(active);
  const configuration = workflow.data ?? DEFAULT_HOME_WORKFLOW;
  const checklist = (segment: 'open' | 'close') => router.push({ pathname: '/cleaning', params: { segment } });
  const status = (segment: 'open' | 'close') => {
    if (query.isError) return '확인 필요';
    const count = query.data?.[segment];
    if (!count) return '불러오는 중';
    return count.total ? `${count.done}/${count.total} 체크` : '체크 항목을 추가해요';
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
  const phaseInfo: { id: HomePhase; title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'open', title: '오픈 준비', subtitle: '손님을 맞이하기 전에', icon: 'sunny-outline' },
    { id: 'business', title: '영업 중', subtitle: '영업 중 필요한 일을 챙겨요', icon: 'storefront-outline' },
    { id: 'close', title: '마감 정리', subtitle: '오늘 기록을 확인하고 내일을 준비해요', icon: 'moon-outline' },
  ];
  const phases = phaseInfo.map(phase => {
    const selected = configuration[phase.id].filter(id => canUseFinancialTabs || !HOME_ACTIONS.find(a => a.id === id)?.financial);
    return { ...phase, actions: selected.map(id => actions[id]), progress: selected.includes('open_check') ? status('open') : selected.includes('close_check') ? status('close') : undefined };
  }).filter(phase => phase.actions.length > 0);
  return <View style={styles.root}>
    <View style={styles.intro}>
      <Text style={styles.eyebrow}>오늘의 매장</Text>
      <Text style={styles.title}>오픈부터 마감까지</Text>
      <Text style={styles.description}>하루의 흐름을 따라 필요한 일을 챙겨요.</Text>
    </View>
    {isAdmin && <Pressable accessibilityRole="button" accessibilityLabel="매장 홈 구성" style={styles.action} onPress={() => router.push('/settings/home-workflow')}>
      <Ionicons name="options-outline" size={20} color={Colors.action} />
      <Text style={styles.actionText}>{workflow.isSuccess && !workflow.data ? '우리 매장의 하루 업무 설정하기' : '매장 홈 구성 수정'}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.gray600} />
    </Pressable>}
    {workflow.isError && <ErrorMessage message={`${homeWorkflowLoadMessage(workflow.error)} 기본 구성을 보여드려요.`} onRetry={() => { void workflow.refetch(); }} />}
    {workflow.isSuccess && !workflow.data && !isAdmin && <Text style={styles.description}>관리자가 매장 홈을 설정하기 전까지 기본 업무를 보여드려요.</Text>}
    {query.isError && <ErrorMessage message="체크 현황을 불러오지 못했어요." onRetry={() => { void query.refetch(); }} />}
    {phases.map((phase, index) => <View key={phase.title} style={styles.phase}>
      <View style={styles.rail}>
        <View style={styles.step}><Text style={styles.stepText}>{String(index + 1).padStart(2, '0')}</Text></View>
        {index < phases.length - 1 && <View style={styles.line} />}
      </View>
      <GlassCard style={styles.card} contentStyle={styles.content}>
        <View style={styles.heading}>
          <Ionicons name={phase.icon} size={22} color={Colors.action} accessible={false} />
          <Text style={styles.phaseTitle}>{phase.title}</Text>
        </View>
        <Text style={styles.description}>{phase.subtitle}</Text>
        {phase.progress && <Text style={styles.progress}>{phase.progress}</Text>}
        <View style={styles.actions}>
          {phase.actions.map(action => <Pressable key={action.label} onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
            <Ionicons name={action.icon} size={18} color={Colors.gray700} accessible={false} />
            <Text style={styles.actionText}>{action.label}</Text>
            <Ionicons name="chevron-forward" size={15} color={Colors.gray600} accessible={false} />
          </Pressable>)}
        </View>
      </GlassCard>
    </View>)}
    <GlassCard contentStyle={styles.personal}>
      <Text style={styles.phaseTitle}>{isAdmin ? '직원·급여 관리' : '나의 근무·급여'}</Text>
      <Text style={styles.description}>매일의 마감과 월별 급여를 구분해서 확인해요.</Text>
      <Pressable style={styles.action} accessibilityRole="button" onPress={() => isAdmin ? goToTab('payroll') : router.push('/mypage/payslip')}>
        <Text style={styles.actionText}>{isAdmin ? '직원과 급여 보기' : '내 급여 명세 보기'}</Text><Ionicons name="chevron-forward" size={16} color={Colors.gray600} />
      </Pressable>
      {isPartTime && <Pressable style={styles.action} accessibilityRole="button" onPress={() => router.push('/mypage/work-minutes')}><Text style={styles.actionText}>월 실근무 시간 제출</Text><Ionicons name="chevron-forward" size={16} color={Colors.gray600} /></Pressable>}
    </GlassCard>
  </View>;
}
const styles = StyleSheet.create({
  root: { gap: 16 }, intro: { paddingTop: 8, paddingBottom: 12, gap: 8 },
  eyebrow: { color: Colors.action, fontFamily: Fonts.wantedSemiBold, fontSize: 13 },
  title: { fontFamily: Fonts.wantedBold, fontSize: 28, lineHeight: 36, color: Colors.black, letterSpacing: -0.8 },
  description: { color: Colors.gray600, fontSize: 13, lineHeight: 20 },
  phase: { flexDirection: 'row', gap: 10 }, rail: { width: 28, alignItems: 'center' },
  step: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.homeBorder },
  stepText: { fontFamily: Fonts.geistSemiBold, fontSize: 11, color: Colors.action },
  line: { flex: 1, width: 1, marginTop: 10, marginBottom: -8, backgroundColor: Colors.taskBorder },
  card: { flex: 1 }, content: { padding: 16, gap: 7 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phaseTitle: { color: Colors.black, fontFamily: Fonts.wantedBold, fontSize: 18, lineHeight: 25 },
  progress: { color: Colors.action, fontSize: 12, fontFamily: Fonts.wantedSemiBold },
  actions: { marginTop: 5, gap: 6 }, action: { minHeight: 46, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.glass.background, flexDirection: 'row', gap: 8, alignItems: 'center' },
  actionText: { flex: 1, color: Colors.gray800, fontSize: 14, fontFamily: Fonts.wantedMedium },
  pressed: { backgroundColor: Colors.pale }, personal: { padding: 18, gap: 9 },
});
