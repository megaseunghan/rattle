/* S04 홈 오늘 할 일(2026-11-27 확정 시안): 오픈/영업 중/마감 탭 + 2열 갤러리 타일, 4개 넘으면 'n개 더 보기'.
 * 순서는 목록 편집(HomeWorkflowEditor)에서 정한 순서. 할 일 없음·체크리스트 미등록·불러오기 실패를 서로 다르게 보인다. */
import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppIcon } from '../icons/AppIcon';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { CardStyle, Type } from '../../constants/designTokens';
import { useAuth } from '../contexts/AuthContext';
import { useTabPager } from '../contexts/TabPagerContext';
import { useDailyChecklistSummary } from '../hooks/useDailyChecklistSummary';
import { useHomeWorkflow } from '../hooks/useHomeWorkflow';
import { homeWorkflowLoadMessage } from '../services/homeWorkflow';
import { DEFAULT_HOME_WORKFLOW, HOME_ACTIONS } from '../utils/homeWorkflow';
import { HomeActionId, HomePhase } from '../../types';
import { HomeWorkflowEditor } from './HomeWorkflowEditor';
import { Skeleton, SkeletonGroup } from './skeleton';
import { HomeSectionHeader } from './home/HomeSectionHeader';
import { TASK_PREVIEW_LIMIT, TILE_TONES, tileCopy, type ChecklistState } from './home/tasks/taskTiles';

const PHASES: { id: HomePhase; label: string }[] = [
  { id: 'open', label: '오픈' }, { id: 'business', label: '영업 중' }, { id: 'close', label: '마감' },
];
type IconName = keyof typeof AppIcon.glyphMap;
const ICONS: Record<HomeActionId, IconName> = {
  open_check: 'checkbox-outline', close_check: 'checkbox-outline', weekday_check: 'checkbox-outline', stock: 'cube-outline',
  stock_edit: 'create-outline', schedule: 'calendar-outline', purchase: 'cart-outline', recipes: 'restaurant-outline',
  sales: 'stats-chart-outline', expenses: 'receipt-outline',
};

export const DailyOperationsHome = memo(function DailyOperationsHome({ active, refreshKey, canUseFinancialTabs, isAdmin }: {
  active: boolean; refreshKey: number; canUseFinancialTabs: boolean; isPartTime?: boolean; isAdmin: boolean;
}) {
  const { goToTab } = useTabPager();
  const { user, store, currentRole, devPreviewMode } = useAuth();
  const [phase, setPhase] = useState<HomePhase>('open');
  const [editorVisible, setEditorVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const canEdit = isAdmin && currentRole === 'admin' && devPreviewMode === 'self';
  useEffect(() => { setPhase('open'); setEditorVisible(false); setExpanded(false); }, [user?.id, store?.id, currentRole, devPreviewMode]);
  const summary = useDailyChecklistSummary(active, refreshKey);
  const workflow = useHomeWorkflow(active, refreshKey);
  const checklist = (segment: 'open' | 'close'): ChecklistState => summary.isError ? { kind: 'error' }
    : summary.data ? { kind: 'ready', count: summary.data[segment] } : { kind: 'loading' };
  const go: Record<HomeActionId, () => void> = {
    open_check: () => router.push({ pathname: '/cleaning', params: { segment: 'open' } }),
    close_check: () => router.push({ pathname: '/cleaning', params: { segment: 'close' } }),
    weekday_check: () => router.push({ pathname: '/cleaning', params: { segment: 'weekday' } }),
    stock: () => goToTab('stock'), stock_edit: () => goToTab('stock'),
    schedule: () => router.push('/mypage/schedule'), purchase: () => router.push('/purchases/new'),
    recipes: () => router.push('/recipes'), sales: () => goToTab('sales'), expenses: () => router.push('/expenses'),
  };
  // 저장한 구성이 없으면(null) 기본 구성을 쓴다. 처음 불러오기가 실패하면 기본 구성으로 바꾸지 않고 실패를 보인다.
  const configuration = workflow.data ?? (workflow.isError ? null : DEFAULT_HOME_WORKFLOW);
  const ids = (configuration?.[phase] ?? []).filter(id => canUseFinancialTabs || !HOME_ACTIONS.find(a => a.id === id)?.financial);
  const shown = expanded ? ids : ids.slice(0, TASK_PREVIEW_LIMIT);
  const phaseLabel = PHASES.find(item => item.id === phase)!.label;
  const selectPhase = (id: HomePhase) => { setPhase(id); setExpanded(false); };
  const hasChecklist = ids.includes('open_check') || ids.includes('close_check');
  return <View style={styles.root}>
    <HomeSectionHeader title="오늘 할 일" tabsLabel="업무 구간" tabs={PHASES} selected={phase} onSelect={selectPhase} />
    <View style={styles.card}>
      {workflow.isPending && !workflow.data ? <TileSkeleton />
        : workflow.isError && !workflow.data ? <LoadFailure onRetry={() => { void workflow.refetch(); }} />
        : ids.length ? <View style={styles.grid}>
          {shown.map(id => <TaskTile key={id} id={id} onPress={go[id]}
            checklist={id === 'open_check' ? checklist('open') : id === 'close_check' ? checklist('close') : undefined} />)}
        </View> : <Text style={styles.empty}>{phaseLabel}에 넣어 둔 할 일이 없어요</Text>}
      {workflow.isError && !!workflow.data && <Notice text={`${homeWorkflowLoadMessage(workflow.error)} 이전 목록을 보여드려요.`} onRetry={() => { void workflow.refetch(); }} />}
      {summary.isError && hasChecklist && <Notice text="체크 현황을 불러오지 못했어요." onRetry={() => { void summary.refetch(); }} />}
      {ids.length > TASK_PREVIEW_LIMIT && <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)}
        style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
        <Text style={styles.moreText}>{expanded ? '접기' : `${ids.length - TASK_PREVIEW_LIMIT}개 더 보기`}</Text>
        <AppIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.gray600} accessible={false} />
      </Pressable>}
      {canEdit && <Pressable accessibilityRole="button" accessibilityLabel="할 일 목록 편집" onPress={() => setEditorVisible(true)}
        style={({ pressed }) => [styles.edit, pressed && styles.pressed]}>
        <Text style={styles.editText}>목록 편집</Text>
      </Pressable>}
    </View>
    {canEdit && <HomeWorkflowEditor visible={editorVisible} initialPhase={phase} onClose={() => setEditorVisible(false)} />}
  </View>;
});

function TaskTile({ id, checklist, onPress }: { id: HomeActionId; checklist?: ChecklistState; onPress: () => void }) {
  const copy = tileCopy(id, checklist);
  const tone = TILE_TONES[copy.tone];
  return <Pressable accessibilityRole="button" accessibilityLabel={`${copy.title}, ${copy.description}`} onPress={onPress}
    style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
    <View style={[styles.icon, { backgroundColor: tone.background }]}><AppIcon name={ICONS[id]} size={20} color={tone.color} accessible={false} /></View>
    <Text style={styles.description} numberOfLines={2}>{copy.description}</Text>
    <Text style={styles.title} numberOfLines={2}>{copy.title}</Text>
  </Pressable>;
}

function TileSkeleton() {
  return <SkeletonGroup label="할 일 불러오는 중" style={styles.grid}>
    {[0, 1].map(index => <View key={index} style={styles.tile}>
      <Skeleton width={36} height={36} radius={12} /><Skeleton width="80%" height={11} style={styles.skGap} /><Skeleton width="60%" height={15} />
    </View>)}
  </SkeletonGroup>;
}

function LoadFailure({ onRetry }: { onRetry: () => void }) {
  return <View style={styles.failure} accessibilityRole="alert">
    <Text style={styles.failureTitle}>할 일을 불러오지 못했어요</Text>
    <Text style={styles.failureText}>잠시 뒤 다시 불러와 주세요</Text>
    <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
      <Text style={styles.editText}>다시 불러오기</Text>
    </Pressable>
  </View>;
}

function Notice({ text, onRetry }: { text: string; onRetry: () => void }) {
  return <View style={styles.notice}>
    <AppIcon name="information-circle-outline" size={16} color={Colors.gray500} accessible={false} />
    <Text style={styles.noticeText}>{text}</Text>
    <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}><Text style={styles.editText}>다시 시도</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: 4 },
  card: { ...CardStyle, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 4, gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexBasis: '47%', flexGrow: 1, minHeight: 112, padding: 14, borderRadius: 16, backgroundColor: Colors.gray50, gap: 2 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 'auto' },
  description: { marginTop: 12, fontFamily: Fonts.wantedRegular, fontSize: 12, lineHeight: 16, color: Colors.gray500 },
  title: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.md, lineHeight: 20, color: Colors.black },
  skGap: { marginTop: 22, marginBottom: 6 },
  empty: { paddingVertical: 22, textAlign: 'center', fontFamily: Fonts.wantedRegular, fontSize: Type.base, color: Colors.gray500 },
  more: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  moreText: { fontFamily: Fonts.wantedMedium, fontSize: Type.sm, color: Colors.gray600 },
  edit: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: Colors.hairline },
  editText: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.sm, color: Colors.action },
  failure: { alignItems: 'center', paddingVertical: 16, gap: 4 },
  failureTitle: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.base, color: Colors.black },
  failureText: { fontFamily: Fonts.wantedRegular, fontSize: Type.sm, color: Colors.gray500 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  notice: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingLeft: 12, borderRadius: 12, backgroundColor: Colors.contextBg },
  noticeText: { flexGrow: 1, flexShrink: 1, flexBasis: 150, fontFamily: Fonts.wantedRegular, fontSize: Type.sm, color: Colors.gray600 },
  pressed: { opacity: 0.7 },
});
