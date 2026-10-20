import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { approveStoreMember, rejectStoreMember, removeStoreMember } from '../../lib/services/storeMembers';
import { useStoreMembers } from '../../lib/hooks/useStoreMembers';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { StoreMember } from '../../types';
import { getErrorMessage } from '../../lib/utils/error';

export default function MembersScreen() {
  const { store } = useAuth();
  const { members, loading, error, refetch: loadMembers } = useStoreMembers();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const scope = store?.id;
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
      const result = await approveStoreMember(member.id);
      if (!mounted.current || scopeRef.current !== scope) return;
      await loadMembers();
      if (!mounted.current || scopeRef.current !== scope) return;
      Alert.alert('승인 완료', `${result.employee_name} 님의 직원 정보에 계정을 연결했어요.\n처음 등록된 직원은 인건비에서 고용형태·시급·급여 정보를 확인해주세요.`);
    });
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

  const pending = members.filter(m => m.status === 'pending');
  const approved = members.filter(m => m.status === 'approved');
  const rejected = members.filter(m => m.status === 'rejected');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>멤버 관리</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {error && <ErrorMessage message={error} onRetry={loadMembers} />}
          <Text style={styles.emptyText}>승인하면 이름·휴대폰 번호가 같은 기존 직원에 계정이 연결돼요. 같은 직원이 없으면 새로 등록돼요.</Text>
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
                        <Text style={styles.approveBtnText}>승인</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.black },
  scroll: { padding: 20, paddingBottom: 48 },
  sectionTitle: {
    fontSize: 15, fontWeight: '700', color: Colors.black,
    marginBottom: 10, marginTop: 8,
  },
  badge: { fontSize: 15, fontWeight: '700', color: Colors.danger },
  emptyText: { fontSize: 14, color: Colors.gray400, marginBottom: 16 },
  card: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.gray100, overflow: 'hidden',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', padding: 14,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.gray100 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
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
    paddingVertical: 7, borderRadius: 8,
  },
  approveBtnText: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  rejectBtn: {
    borderWidth: 1, borderColor: Colors.gray200,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
  },
  rejectBtnText: { color: Colors.gray600, fontSize: 13, fontWeight: '600' },
});
