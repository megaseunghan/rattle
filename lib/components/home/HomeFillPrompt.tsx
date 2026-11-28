/* 마저 채우기 홈 유도(useStoreFillPrompt 계약): 사장님에게 하루 한 번 시트, 관리자에게 알림 카드. */
import { useEffect, useMemo } from 'react';
import { router } from 'expo-router';
import type { StoreFillPrompt } from '../../hooks/useStoreFillPrompt';
import { STORE_FILL_GROUPS, isStoreFillGroupDone, type StoreFillGroup } from '../../utils/storeFill';
import { FillPromptSheet } from '../store-fill/FillPromptSheet';
import type { AlertCardItem } from './alerts/AlertCard';

const openFill = () => router.push('/store-fill' as never);

/** 알림 묶음 맨 위에 둘 카드: 월급날 알림 → 마저 채우기. 홈에서 닫지 않는다. */
export function fillAlertCards(prompt: StoreFillPrompt): AlertCardItem[] {
  const cards: AlertCardItem[] = [];
  if (prompt.paydayAlert) cards.push({ key: `fill-payday-${prompt.paydayAlert.kind}`, title: prompt.paydayAlert.title,
    description: prompt.paydayAlert.body, actionHint: '매장 정보 화면으로 이동해요', onPress: openFill });
  if (prompt.alert) cards.push({ key: 'fill-store', title: prompt.alert.title, description: prompt.alert.body,
    actionHint: '매장 정보 마저 채우기 화면으로 이동해요', onPress: openFill });
  return cards;
}

export function HomeFillPromptSheet({ prompt }: { prompt: StoreFillPrompt }) {
  const { shouldShowSheet, onSheetShown, onLater, values, filledCount } = prompt;
  useEffect(() => { if (shouldShowSheet) onSheetShown(); }, [shouldShowSheet, onSheetShown]);
  const doneGroups = useMemo(() => Object.fromEntries(STORE_FILL_GROUPS.map(group => [group, !!values && isStoreFillGroupDone(group, values)])) as Record<StoreFillGroup, boolean>, [values]);
  return <FillPromptSheet visible={shouldShowSheet} filledCount={filledCount} doneGroups={doneGroups}
    onLater={onLater} onFill={() => { onLater(); openFill(); }} />;
}
