import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { createStoreInviteCode, rejectStoreMember, removeStoreMember, transferStoreOwnership } from '../../lib/services/storeMembers';
import { useMemberApproval } from '../../lib/hooks/useMemberApproval';
import { MemberApprovalModal } from '../../lib/components/MemberApprovalModal';
import { useStoreMembers } from '../../lib/hooks/useStoreMembers';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { JoinOnboardingInput, MemberApprovalChoice, MemberApprovalResult, StoreMember } from '../../types';
import { getErrorMessage } from '../../lib/utils/error';

export default function MembersScreen() {
  const { store, user, refreshStore } = useAuth();
  const { members, loading, error, refetch: loadMembers } = useStoreMembers();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const approval = useMemberApproval();
  const scope = `${user?.id}:${store?.id}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useFocusEffect(useCallback(() => { void loadMembers(); }, [loadMembers]));

  async function runAction(action: () => Promise<void>) {
    if (busyRef.current || !store) return;
    busyRef.current = true;
    setBusy(true);
    try { await action(); }
    catch (e: unknown) {
      if (mounted.current && scopeRef.current === scope) Alert.alert('처리 확인', getErrorMessage(e, '처리하지 못했어요. 다시 시도해주세요.'), [
        { text: '확인' }, { text: '직원 정보 확인', onPress: () => router.dismissTo({ pathname: '/(tabs)', params: { targetTab: 'payroll' } }) },
      ]);
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function handleApprove(member: StoreMember) {
    void runAction(async () => {
      await approval.prepare(member);
    });
  }

  async function finishApproval(result: MemberApprovalResult) {
    if (!mounted.current || scopeRef.current !== scope) return;
    await loadMembers();
    if (!mounted.current || scopeRef.current !== scope) return;
    Alert.alert('합류 완료', `${result.employee_name} 님의 직원 정보에 계정을 연결했어요.\n확정한 조건이 인건비에 반영됐어요. 급여 내역은 새로 생성하지 않았어요.`);
  }

  function handleChoice(choice: MemberApprovalChoice, review?: JoinOnboardingInput) {
    const selection = approval.selection;
    if (!selection || busy) return;
    const candidate = choice.kind === 'rehire' ? selection.candidates.find(e => e.id === choice.employeeId) : null;
    Alert.alert(
      '최종 합류 확인',
      `확인한 근무 조건과 계좌로 최종 합류 처리할까요?${candidate ? '\n선택한 기존 직원의 과거 급여 이력이 신청 계정에 연결돼요.' : ''}`,
      [{ text: '취소', style: 'cancel' }, { text: '최종 합류', onPress: () => {
        if (scopeRef.current !== scope || !mounted.current) return;
        void runAction(async () => {
          const result = await approval.confirm(choice, review);
          if (result) await finishApproval(result);
        });
      } }],
    );
  }

  function handleReject(member: StoreMember) {
    Alert.alert('참여 거절', `${member.applicant_name ?? member.user_email ?? '신청자'} 님의 참여를 거절할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '거절', style: 'destructive', onPress: () => {
        if (scopeRef.current !== scope) return;
        void runAction(async () => {
          await rejectStoreMember(member.store_id, member.id);
          if (mounted.current && scopeRef.current === scope) await loadMembers();
        });
      } },
    ]);
  }

  function handleRemove(member: StoreMember) {
    Alert.alert('멤버 제거', `${member.applicant_name ?? member.user_email ?? '이 멤버'} 님을 매장에서 제거할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '제거', style: 'destructive', onPress: () => {
        if (scopeRef.current !== scope) return;
        void runAction(async () => {
          await removeStoreMember(member.store_id, member.id);
          if (mounted.current && scopeRef.current === scope) await loadMembers();
        });
      } },
    ]);
  }

  function handleTransfer(member: StoreMember) {
    Alert.alert('매장 소유권 이전', `${member.applicant_name ?? member.user_email ?? '선택한 멤버'} 님에게 소유권을 넘길까요? 상대방에게 매장 관리 권한이 부여돼요.`, [
      { text: '취소', style: 'cancel' },
      { text: '이전하기', style: 'destructive', onPress: () => {
        if (scopeRef.current !== scope || !store) return;
        void runAction(async () => {
          await transferStoreOwnership(store.id, member.id);
          if (mounted.current && scopeRef.current === scope) {
            await refreshStore();
            await loadMembers();
          }
        });
      } },
    ]);
  }

  const pending = useMemo(() => members.filter(m => m.status === 'pending'), [members]);
  const approved = useMemo(() => members.filter(m => m.status === 'approved'), [members]);
  const rejected = useMemo(() => members.filter(m => m.status === 'rejected'), [members]);

  function handleInvite() {
    if (!store) return;
    void runAction(async () => {
      const code = await createStoreInviteCode(store.id);
      if (mounted.current && scopeRef.current === scope) {
        const formatted = code.match(/.{1,4}/g)?.join('-') ?? code;
        await Share.share({ message: `${store.name} 직원 참여코드: ${formatted}\n래틀 앱 → 기존 매장 참여에서 입력해주세요. 코드는 발급일부터 7일간 사용할 수 있어요.` });
      }
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="뒤로가기">
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>멤버 관리</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {error && <ErrorMessage message={error} onRetry={loadMembers} />}
          <Text style={styles.emptyText}>신청 정보를 확인·수정한 뒤 최종 합류를 승인해주세요. 확정 전에는 인건비에 반영되지 않아요.</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="직원 참여코드 공유" disabled={busy} onPress={handleInvite} style={styles.approveBtn}>
            <Text style={styles.approveBtnText}>직원 참여코드 공유</Text>
          </TouchableOpacity>
          {/* 승인 대기 */}
          {pending.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>
                승인 대기
                <Text style={styles.badge}> {pending.length}</Text>
              </Text>
              <View style={styles.card}>
                {pending.map((m, i) => (
                  <View key={m.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                    <View style={styles.rowLeft}>
                      <Ionicons name="person-circle-outline" size={36} color={Colors.gray300} />
                      <View style={styles.rowInfo}>
                        <Text style={styles.email}>{m.applicant_name ?? m.user_email ?? '알 수 없는 사용자'}</Text>
                        <Text style={styles.date}>
                          {m.phone ? `${m.phone} · ` : ''}{new Date(m.created_at).toLocaleDateString('ko-KR')} 신청
                        </Text>
                      </View>
                    </View>
                    <View style={styles.actionBtns}>
                      <TouchableOpacity style={styles.approveBtn} disabled={busy} onPress={() => handleApprove(m)}>
                        <Text style={styles.approveBtnText}>신청 확인</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.rejectBtn} disabled={busy} onPress={() => handleReject(m)}>
                        <Text style={styles.rejectBtnText}>거절</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* 현재 멤버 */}
          <Text style={styles.sectionTitle}>현재 멤버</Text>
          {approved.length === 0 ? (
            <Text style={styles.emptyText}>승인된 멤버가 없습니다.</Text>
          ) : (
            <View style={styles.card}>
              {approved.map((m, i) => (
                <View key={m.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                  <View style={styles.rowLeft}>
                    <Ionicons name="person-circle-outline" size={36} color={Colors.gray300} />
                    <View style={styles.rowInfo}>
                      <Text style={styles.email}>{m.applicant_name ?? m.user_email ?? '알 수 없는 사용자'}</Text>
                      <View style={styles.roleBadge}>
                        <Text style={[styles.roleText, m.role === 'admin' && styles.roleAdmin]}>
                          {m.role === 'admin' ? '관리자' : '일반'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {store?.owner_id === user?.id && m.user_id !== user?.id && (
                    <TouchableOpacity disabled={busy} onPress={() => handleTransfer(m)} style={styles.rejectBtn}>
                      <Text style={styles.rejectBtnText}>소유권 이전</Text>
                    </TouchableOpacity>
                  )}
                  {m.role !== 'admin' && (
                    <TouchableOpacity disabled={busy} onPress={() => handleRemove(m)} hitSlop={10}>
                      <Ionicons name="person-remove-outline" size={20} color={Colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* 거절된 멤버 */}
          {rejected.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 24 }]}>거절됨</Text>
              <View style={styles.card}>
                {rejected.map((m, i) => (
                  <View key={m.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                    <View style={styles.rowLeft}>
                      <Ionicons name="person-circle-outline" size={36} color={Colors.gray200} />
                      <View style={styles.rowInfo}>
                        <Text style={[styles.email, { color: Colors.gray400 }]}>
                          {m.user_email ?? '알 수 없는 사용자'}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity disabled={busy} onPress={() => handleRemove(m)} hitSlop={10}>
                      <Ionicons name="close-circle-outline" size={20} color={Colors.gray400} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}
      {approval.selection && <MemberApprovalModal key={`${approval.selection.member.id}:${approval.selection.profile?.revision ?? 0}`} profile={approval.selection.profile} member={approval.selection.member} candidates={approval.selection.candidates} busy={busy} onChoose={handleChoice} onClose={approval.dismiss} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12, backgroundColor: Colors.homeCanvas,
    borderBottomWidth: 1, borderBottomColor: Colors.homeBorder,
  },
  backBtn: { width: 44, height: 44, justifyContent: 'center' },
  title: { flexShrink: 1, fontSize: 22, fontWeight: '700', color: Colors.black },
  scroll: { padding: 20, paddingBottom: 48 },
  sectionTitle: {
    fontSize: 15, fontWeight: '700', color: Colors.black,
    marginBottom: 10, marginTop: 8,
  },
  badge: { fontSize: 15, fontWeight: '700', color: Colors.danger },
  emptyText: { fontSize: 14, color: Colors.gray400, marginBottom: 16 },
  card: {
    backgroundColor: Colors.white, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.homeBorder, overflow: 'hidden',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: 16,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.homeBorder },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 150 },
  rowInfo: { flex: 1 },
  email: { fontSize: 14, fontWeight: '600', color: Colors.black, marginBottom: 2 },
  date: { fontSize: 12, color: Colors.gray400 },
  roleBadge: { alignSelf: 'flex-start' },
  roleText: {
    fontSize: 11, fontWeight: '600', color: Colors.gray500,
    backgroundColor: Colors.gray100, paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 6, overflow: 'hidden',
  },
  roleAdmin: { color: Colors.primary, backgroundColor: Colors.tinted },
  actionBtns: { flexDirection: 'row', gap: 8 },
  approveBtn: {
    backgroundColor: Colors.primary, paddingHorizontal: 14,
    paddingVertical: 7, borderRadius: 12, minHeight: 44, justifyContent: 'center',
  },
  approveBtnText: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  rejectBtn: {
    borderWidth: 1, borderColor: Colors.gray200,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, minHeight: 44, justifyContent: 'center',
  },
  rejectBtnText: { color: Colors.gray600, fontSize: 13, fontWeight: '600' },
});
