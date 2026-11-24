import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { CardStyle, Radius, Spacing, Type } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { useStoreMembers } from '../../lib/hooks/useStoreMembers';
import { useRoleSettings } from '../../lib/hooks/useRoleSettings';
import { AppBar } from '../../lib/components/ui';
import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { Skeleton, SkeletonGroup } from '../../lib/components/skeleton';
export default function StoreManagerScreen() {
  const { user, store, devPreviewMode } = useAuth();
  return <ManagerForm key={`${user?.id}:${store?.id}:${devPreviewMode}`} />;
}
function ManagerForm() {
  const { store } = useAuth(); const state = useRoleSettings(); const members = useStoreMembers(); const employees = useEmployees();
  const [selection, setSelection] = useState<string | null>(null); const [confirm, setConfirm] = useState<'assign' | 'remove' | null>(null);
  useEffect(() => { if (state.allowed) { void members.refetch(); void employees.refetch().catch(() => {}); } }, [state.allowed, members.refetch, employees.refetch]);
  const current = members.members.find(member => member.id === state.access?.manager_member_id);
  const currentEmployee = employees.employees.find(employee => employee.id === state.access?.manager_employee_id);
  const currentName = currentEmployee?.name || current?.applicant_name || '현재 점장';
  const candidates = members.members.filter(member => member.status === 'approved' && member.user_id !== store?.owner_id && member.id !== current?.id)
    .flatMap(member => { const employee = employees.employees.find(item => item.user_id === member.user_id && item.is_active); return employee ? [{ member, employee }] : []; });
  const selected = candidates.find(candidate => candidate.member.id === selection);
  const locked = ['saving', 'unknown', 'conflict', 'saved', 'savedRefresh'].includes(state.outcome);
  return <SafeAreaView style={s.root}><GlassBackdrop /><AppBar title="점장 지정" transparent onBack={() => router.back()} />
    {!state.allowed ? <ErrorMessage message="사장님에게 요청해주세요. 점장 지정은 이 매장의 사장님만 바꿀 수 있어요" /> : state.loading || members.loading || employees.loading ? <SkeletonGroup label="점장 정보 불러오는 중" style={s.content}>
      <Skeleton width="58%" height={24} />
      <View style={s.card}><Skeleton width="28%" height={16} /><Skeleton width="44%" height={24} /><Skeleton width="72%" height={14} /></View>
      <View style={s.card}>{[0, 1, 2].map(i => <View key={i} style={s.skeletonCandidate}><Skeleton width={24} height={24} radius={12} /><View style={{ flex: 1 }}><Skeleton width={i % 2 ? '40%' : '52%'} height={14} /></View></View>)}</View>
    </SkeletonGroup> : state.error || members.error || employees.error ? <ErrorMessage message={state.error || members.error || '직원 정보를 불러오지 못했어요. 다시 확인해주세요'} onRetry={() => { void state.refetch(true); void members.refetch(); void employees.refetch().catch(() => {}); }} /> : <>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.heading}>점장을 골라주세요</Text>
        <View style={s.card}><Text style={s.label}>지금 점장</Text><Text style={current ? s.person : s.body}>{current ? `${currentName}님` : '아직 점장을 지정하지 않았어요'}</Text>
          {current ? <><Text style={s.body}>급여·직원·출퇴근을 관리해요.</Text><Pressable accessibilityRole="button" disabled={locked} style={s.action} onPress={() => setConfirm('remove')}><Text style={s.link}>해제하기</Text></Pressable></> : <Text style={s.body}>기존 관리자는 직원으로 바뀌어요. 이 일을 맡길 점장을 지정해주세요.</Text>}
        </View>
        {!candidates.length ? <View style={s.card}><Text style={s.label}>지정할 직원이 아직 없어요</Text><Text style={s.body}>직원 목록에서 합류를 승인해주세요.</Text></View> : <View style={s.card}>{candidates.map(({ member, employee }) => <Pressable key={member.id} accessibilityRole="radio" accessibilityLabel={`${employee.name}님`} accessibilityState={{ checked: selection === member.id, disabled: locked }} disabled={locked} onPress={() => setSelection(member.id)} style={[s.candidate, selection === member.id && s.selected]}><View style={s.flex}><Text style={s.label}>{employee.name}님</Text><Text style={s.body}>{employee.employment_type === 'part_time' ? '파트타이머' : '직원'}</Text></View><Text style={s.link}>선택</Text></Pressable>)}</View>}
        <Text style={s.body}>본인 정정은 사장님에게 요청해주세요.</Text>
        {!!state.outcome && <Text accessibilityLiveRegion="polite" style={s.body}>{({ saving: '점장 지정을 저장하고 있어요', saved: '점장 지정을 저장했어요', savedRefresh: '점장 지정은 저장했어요. 저장한 내용을 불러오지 못했어요', unknown: '저장됐는지 확인하고 있어요. 다시 저장하지 말고 설정을 확인해주세요', conflict: '다른 사람이 먼저 바꿨어요. 설정을 다시 확인해주세요', failed: '저장하지 못했어요. 잠시 후 다시 시도해주세요' } as Record<string, string>)[state.outcome]}</Text>}
      </ScrollView>
      <View style={s.footer}>{locked && state.outcome !== 'saving' ? <Pressable accessibilityRole="button" style={s.button} onPress={() => { void state.refetch(true); void members.refetch(); }}><Text style={s.buttonText}>확인하기</Text></Pressable> : <Pressable accessibilityRole="button" style={[s.button, (!selected || locked) && s.disabled]} disabled={!selected || locked} onPress={() => setConfirm('assign')}><Text style={s.buttonText}>{current ? '바꾸기' : '지정하기'}</Text></Pressable>}</View>
    </>}
    <Modal visible={confirm !== null && !locked && state.allowed} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
      <View style={s.shade}><View style={s.modal} accessibilityViewIsModal>
        <Text style={s.heading}>{confirm === 'remove' ? `${currentName}님의 점장 지정을 해제할까요?` : current ? `${selected?.employee.name}님으로 점장을 바꿀까요?` : `${selected?.employee.name}님을 점장으로 지정할까요?`}</Text>
        <Text style={s.body}>{confirm === 'remove' ? '직원으로 바뀌며 관리 권한이 사라져요. 기존 기록은 유지돼요.' : current ? '기존 점장은 직원으로 바뀌어요. 기존 기록은 유지돼요.' : '급여·직원·출퇴근을 관리할 수 있어요.'}</Text>
        <View style={s.actions}><Pressable accessibilityRole="button" style={s.action} onPress={() => setConfirm(null)}><Text style={s.link}>닫기</Text></Pressable><Pressable accessibilityRole="button" style={s.action} onPress={() => { const id = confirm === 'remove' ? null : selection; setConfirm(null); void state.save('manager', id); }}><Text style={s.link}>{confirm === 'remove' ? '해제하기' : current ? '바꾸기' : '지정하기'}</Text></Pressable></View>
      </View></View>
    </Modal>
  </SafeAreaView>;
}
const s = StyleSheet.create({ skeletonCandidate: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 8 }, root: { flex: 1, backgroundColor: Colors.homeCanvas }, flex: { flex: 1 }, content: { padding: Spacing.screenX, gap: 20 }, heading: { fontFamily: Fonts.wantedBold, fontSize: 22, color: Colors.black }, card: { ...CardStyle, padding: Spacing.cardPadding, gap: 12 },
  label: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.lg, lineHeight: 26, color: Colors.black }, person: { fontFamily: Fonts.wantedBold, fontSize: 24, color: Colors.black }, body: { fontFamily: Fonts.wantedRegular, fontSize: Type.base, lineHeight: 22, color: Colors.gray600 }, candidate: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 8, borderRadius: Radius.field }, selected: { backgroundColor: Colors.tinted },
  action: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }, link: { fontFamily: Fonts.wantedMedium, fontSize: Type.base, color: Colors.action }, footer: { padding: Spacing.screenX }, button: { minHeight: 52, backgroundColor: Colors.action, borderRadius: Radius.field, alignItems: 'center', justifyContent: 'center' }, buttonText: { fontFamily: Fonts.wantedMedium, fontSize: Type.base, color: Colors.white }, disabled: { opacity: 0.5 },
  shade: { flex: 1, backgroundColor: Colors.overlayDetail, justifyContent: 'center', padding: Spacing.screenX }, modal: { backgroundColor: Colors.white, borderRadius: 20, padding: Spacing.screenX, gap: 16 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }, });
