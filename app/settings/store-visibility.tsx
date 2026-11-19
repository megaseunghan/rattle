import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { Radius, Spacing, Type } from '../../constants/designTokens';
import type { FinancialShareScope, StoreVisibilityScopes } from '../../types';
import { useRoleSettings } from '../../lib/hooks/useRoleSettings';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';
import { AppBar } from '../../lib/components/ui';
import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { AppIcon } from '../../lib/icons/AppIcon';
import { GlassCard } from '../../lib/components/GlassCard';
import { Illustration } from '../../lib/icons/Illustration';
const fields: [keyof StoreVisibilityScopes, string][] = [['financial_share_scope', '손익'], ['attendance_share_scope', '다른 직원 근태'], ['payroll_share_scope', '다른 직원 급여']];
const options: [FinancialShareScope, string][] = [['none', '공유 안 함'], ['regular_only', '직원만'], ['all_staff', '직원과 파트타이머']];
export default function VisibilitySettingsScreen() {
  const state = useRoleSettings();
  const [draft, setDraft] = useState<StoreVisibilityScopes | null>(null);
  const [expanded, setExpanded] = useState<keyof StoreVisibilityScopes | null>(null);
  useEffect(() => { setDraft(state.visibility); }, [state.visibility]);
  const dirty = !!draft && fields.some(([key]) => draft[key] !== state.visibility?.[key]);
  const locked = ['saving', 'unknown', 'saved', 'savedRefresh', 'conflict'].includes(state.outcome);
  useConfirmLeave(dirty && !['saved', 'savedRefresh'].includes(state.outcome) || state.outcome === 'saving', { blockLeave: state.outcome === 'saving' });
  return <SafeAreaView style={s.root}><GlassBackdrop /><AppBar title="열람 설정" transparent onBack={() => router.back()} />
    {!state.allowed ? <ErrorMessage message="사장님에게 요청해주세요. 점장 지정과 열람 설정은 이 매장의 사장님만 바꿀 수 있어요" /> : state.loading ? <LoadingSpinner /> : state.error ? <ErrorMessage message={state.error} onRetry={() => { void state.refetch(true); }} /> : <ScrollView contentContainerStyle={s.content}>
      <Text style={s.heading}>자료를 누구에게 보여줄까요?</Text>
      <View style={s.settingsList}>{fields.map(([key, label]) => <GlassCard key={key} contentStyle={s.cardContent}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded === key, disabled: locked }} disabled={locked} onPress={() => setExpanded(expanded === key ? null : key)} style={s.row}>
          <Illustration name={key === 'financial_share_scope' ? 'profit-loss' : key === 'attendance_share_scope' ? 'work-time' : 'payroll'} size={48} /><Text style={[s.label, { flex: 1 }]}>{label}</Text><Text style={s.badge}>{draft?.[key] === 'all_staff' ? '직원·파트타이머' : options.find(([value]) => value === draft?.[key])?.[1] ?? '확인 중'}</Text><AppIcon name={expanded === key ? 'chevron-down' : 'chevron-forward'} size={16} color={Colors.gray500} />
        </Pressable>
        {expanded === key && <View style={s.options}><Text style={s.label}>누가 볼 수 있나요?</Text>{options.map(([value, title]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: draft?.[key] === value, disabled: locked }} disabled={locked} style={s.choice} onPress={() => setDraft(previous => previous ? { ...previous, [key]: value } : null)}><AppIcon name={draft?.[key] === value ? 'radio-button-on' : 'radio-button-off'} size={20} color={Colors.action} /><Text style={s.body}>{title}</Text></Pressable>)}<Text style={s.label}>어떤 자료가 보이나요?</Text><Text style={s.body}>{key === 'financial_share_scope' ? '매출·매입·비용·영업이익과 인건비 합계를 공개해요.' : key === 'attendance_share_scope' ? '출퇴근 시각·종류·확인 필요·처리 상태를 공개해요.' : '세전액·적용 시급·현재 기본급·시급만 보여줘요.'}</Text></View>}
      </GlassCard>)}</View>
      <Text style={s.body}>본인 자료와 사장님·점장님 열람은 유지돼요.</Text>
      {!!state.outcome && <Text accessibilityLiveRegion="polite" style={s.body}>{({ saving: '열람 설정을 저장하고 있어요', unknown: '저장됐는지 확인하고 있어요. 다시 저장하지 말고 설정을 확인해주세요', conflict: '다른 사람이 먼저 바꿨어요. 설정을 다시 확인해주세요', saved: '열람 설정을 저장했어요', savedRefresh: '열람 설정은 저장했어요. 저장한 내용을 불러오지 못했어요', failed: '저장하지 못했어요. 잠시 후 다시 시도해주세요' } as Record<string, string>)[state.outcome]}</Text>}
      {locked && state.outcome !== 'saving' ? <Pressable style={s.button} accessibilityRole="button" onPress={() => { void state.refetch(true); }}><Text style={s.buttonText}>확인하기</Text></Pressable> : <Pressable style={[s.button, (!dirty || locked) && s.disabled]} accessibilityRole="button" accessibilityState={{ disabled: !dirty || locked }} disabled={!dirty || locked} onPress={() => { if (draft) void state.save('visibility', draft); }}><Text style={s.buttonText}>저장하기</Text></Pressable>}
    </ScrollView>}
  </SafeAreaView>;
}
const s = StyleSheet.create({ root: { flex: 1, backgroundColor: Colors.homeCanvas }, content: { padding: Spacing.screenX, gap: 20, paddingBottom: 40 }, heading: { fontFamily: Fonts.wantedBold, fontSize: 22, color: Colors.black, lineHeight: 30 },
  cardContent: { padding: 0 }, row: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, alignItems: 'center', minHeight: 58 }, label: { fontFamily: Fonts.wantedMedium, fontSize: Type.base, lineHeight: 22, color: Colors.gray800 },
  badge: { fontFamily: Fonts.wantedMedium, fontSize: 14, color: Colors.action, backgroundColor: Colors.tinted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm }, settingsList: { gap: 8 }, choice: { minHeight: 44, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'center' }, options: { paddingHorizontal: 12, paddingBottom: 12 }, body: { fontFamily: Fonts.wantedRegular, fontSize: Type.base, color: Colors.gray600, lineHeight: 22 },
  button: { minHeight: 52, backgroundColor: Colors.action, borderRadius: Radius.field, alignItems: 'center', justifyContent: 'center' }, buttonText: { fontFamily: Fonts.wantedMedium, fontSize: Type.base, color: Colors.white }, disabled: { opacity: 0.5 }, });
