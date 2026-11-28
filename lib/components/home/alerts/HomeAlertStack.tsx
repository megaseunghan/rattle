/**
 * S04 홈 알림(2026-11-27 확정 시안): 맨 위 1장 + 뒤 2장 가장자리로 겹쳐 쌓고, 누르면 펼친다.
 * 닫기·밀기는 홈에서만 숨긴다(기존 home_alert_reads 기록, 실행취소 유지). 1건이면 펼치지 않는다.
 * 펼침 상태는 홈 화면이 가진다(아래로 스크롤하면 자동으로 접기 위해).
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '../../../../constants/colors';
import { Fonts } from '../../../../constants/fonts';
import { Type } from '../../../../constants/designTokens';
import type { HomeAlert } from '../../../../types';
import { useHomeAlerts } from '../../../hooks/useHomeAlerts';
import { AppIcon } from '../../../icons/AppIcon';
import { Skeleton, SkeletonGroup } from '../../skeleton';
import { AlertCard, AlertCardShadow, STACK_STEP, type AlertCardItem } from './AlertCard';

const TITLES: Record<HomeAlert['kind'], string> = {
  stock: '재고', fixedExpenseMissing: '고정비', tossNotSynced: '매출 동기화', monthClose: '월마감',
};

interface Props {
  active: boolean;
  refreshKey: number;
  todaySales?: number;
  financial: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** 묶음 맨 위에 둘 카드(마저 채우기 유도 등). */
  leadingCards?: readonly AlertCardItem[];
  onLayout?: (event: LayoutChangeEvent) => void;
}

type AlertData = ReturnType<typeof useHomeAlerts>;

function useHideFlow(data: AlertData, active: boolean) {
  const [saving, setSaving] = useState<string | null>(null);
  const [undo, setUndo] = useState<HomeAlert | null>(null);
  const [failure, setFailure] = useState<{ alert: HomeAlert; restoring: boolean } | null>(null);
  const mounted = useRef(true), busy = useRef(false), generation = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; }; }, []);
  useEffect(() => { generation.current += 1; if (!active) { setUndo(null); setFailure(null); } }, [active]);
  async function save(alert: HomeAlert, restoring = false) {
    if (busy.current || !active) return;
    busy.current = true;
    const issued = generation.current;
    setSaving(alert.key); setFailure(null);
    try {
      const valid = await (restoring ? data.restoreRead(alert.key) : data.markRead(alert.key));
      if (valid && mounted.current && issued === generation.current) setUndo(restoring ? null : alert);
    } catch {
      if (mounted.current && issued === generation.current) setFailure({ alert, restoring });
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(null);
    }
  }
  return { saving, undo, failure, save };
}

export function HomeAlertStack(props: Props) {
  const { active, refreshKey, todaySales, financial } = props;
  const data = useHomeAlerts(todaySales, undefined, financial, active);
  // 탭 진입은 enabled: active와 재사용 시간이 맡는다. 당겨서 새로고침(refreshKey 증가)만 다시 받는다.
  const lastRefresh = useRef(refreshKey);
  useEffect(() => {
    if (lastRefresh.current === refreshKey) return;
    lastRefresh.current = refreshKey;
    if (active) void data.refetch();
  }, [active, refreshKey, data.refetch]);
  // 계정·매장·공유 범위가 바뀌면 이전 실패·실행취소 상태를 버린다.
  return <StackContent key={data.scope} {...props} data={data} />;
}

function StackContent({ active, data, expanded, onExpandedChange, leadingCards = [], onLayout }: Props & { data: AlertData }) {
  const flow = useHideFlow(data, active);
  const items: AlertCardItem[] = [...leadingCards, ...data.alerts.map(alert => ({
    key: alert.key, title: alert.message, description: `${TITLES[alert.kind]} · ${alert.actionLabel}`,
    actionHint: `${alert.actionLabel} 화면으로 이동해요`, onPress: () => router.push(alert.route as never),
    onDismiss: () => { void flow.save(alert); },
  }))];
  const many = items.length > 1;
  useEffect(() => { if (expanded && !many) onExpandedChange(false); }, [expanded, many, onExpandedChange]);
  const disabled = flow.saving !== null;
  const firstLoad = data.initialLoading && !items.length;
  if (!firstLoad && !items.length && !data.error && !flow.undo && !flow.failure) return null;
  return <View style={styles.root} onLayout={onLayout}>
    {firstLoad && <SkeletonGroup label="알림을 불러오는 중이에요" style={styles.skeleton}>
      <Skeleton width="72%" height={16} /><Skeleton width="50%" height={12} />
    </SkeletonGroup>}
    {!!items.length && (expanded && many ? <View style={styles.list}>
      {items.map(item => <AlertCard key={item.key} item={item} swipeable disabled={disabled} />)}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: true }} accessibilityLabel="알림 접기"
        onPress={() => onExpandedChange(false)} style={({ pressed }) => [styles.fold, pressed && styles.pressed]}>
        <Text style={styles.foldText}>접기</Text><AppIcon name="chevron-up" size={16} color={Colors.gray600} accessible={false} />
      </Pressable>
    </View> : <CollapsedStack items={items} disabled={disabled} onExpand={() => onExpandedChange(true)} />)}
    {data.error && <InlineNotice text="알림을 불러오지 못했어요" action="다시 시도" disabled={disabled || data.loading} onPress={() => { void data.refetch(); }} />}
    {flow.failure && <InlineNotice text={flow.failure.restoring ? '알림을 되살리지 못했어요' : '알림을 숨기지 못했어요'} action="다시 시도"
      disabled={disabled} onPress={() => { void flow.save(flow.failure!.alert, flow.failure!.restoring); }} />}
    {flow.undo && <InlineNotice live text="홈에서 숨겼어요" action={flow.saving === flow.undo.key ? '처리 중' : '실행취소'}
      disabled={disabled} onPress={() => { void flow.save(flow.undo!, true); }} />}
  </View>;
}

function CollapsedStack({ items, disabled, onExpand }: { items: readonly AlertCardItem[]; disabled: boolean; onExpand: () => void }) {
  const depth = Math.min(items.length, 3) - 1;
  const extra = depth * STACK_STEP;
  return <View style={{ paddingBottom: extra }}>
    {depth >= 2 && <AlertCardShadow depth={2} extra={extra} />}
    {depth >= 1 && <AlertCardShadow depth={1} extra={extra} />}
    <AlertCard item={items[0]} swipeable={false} disabled={disabled} expandCount={items.length} onExpand={onExpand} />
  </View>;
}

function InlineNotice({ text, action, disabled, onPress, live }: { text: string; action: string; disabled: boolean; onPress: () => void; live?: boolean }) {
  return <View style={styles.notice} accessibilityLiveRegion={live ? 'polite' : undefined}>
    <AppIcon name="information-circle-outline" size={16} color={Colors.gray500} accessible={false} />
    <Text style={styles.noticeText}>{text}</Text>
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.noticeAction, pressed && styles.pressed]}>
      <Text style={styles.noticeActionText}>{action}</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  list: { gap: 8 },
  skeleton: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.homeBorder, padding: 16, gap: 8 },
  fold: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  foldText: { fontFamily: Fonts.wantedMedium, fontSize: Type.sm, color: Colors.gray600 },
  notice: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingLeft: 12, borderRadius: 12, backgroundColor: Colors.contextBg },
  noticeText: { flexGrow: 1, flexShrink: 1, fontFamily: Fonts.wantedRegular, fontSize: Type.sm, color: Colors.gray600 },
  noticeAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  noticeActionText: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.sm, color: Colors.action },
  pressed: { opacity: 0.65 },
});
