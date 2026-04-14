import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { StoreMember } from '../../types';

export default function MembersScreen() {
  const { store } = useAuth();
  const [members, setMembers] = useState<StoreMember[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMembers = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('store_members')
        .select('*')
        .eq('store_id', store.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMembers((data ?? []) as StoreMember[]);
    } catch (e: unknown) {
      Alert.alert('오류', e instanceof Error ? e.message : '멤버 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [store]);

  useFocusEffect(useCallback(() => { loadMembers(); }, [loadMembers]));

  async function handleApprove(member: StoreMember) {
    try {
      const { error } = await supabase
        .from('store_members')
        .update({ status: 'approved' })
        .eq('id', member.id);
      if (error) throw error;
      await loadMembers();
    } catch (e: unknown) {
      Alert.alert('오류', e instanceof Error ? e.message : '승인에 실패했습니다.');
    }
  }

  async function handleReject(member: StoreMember) {
    Alert.alert('거절', `"${member.user_email ?? member.user_id}" 의 참여를 거절하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '거절',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('store_members')
              .update({ status: 'rejected' })
              .eq('id', member.id);
            if (error) throw error;
            await loadMembers();
          } catch (e: unknown) {
            Alert.alert('오류', e instanceof Error ? e.message : '거절에 실패했습니다.');
          }
        },
      },
    ]);
  }

  async function handleRemove(member: StoreMember) {
    Alert.alert('멤버 제거', `"${member.user_email ?? member.user_id}" 를 매장에서 제거하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '제거',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('store_members')
              .delete()
              .eq('id', member.id);
            if (error) throw error;
            await loadMembers();
          } catch (e: unknown) {
            Alert.alert('오류', e instanceof Error ? e.message : '제거에 실패했습니다.');
          }
        },
      },
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
                        <Text style={styles.email}>{m.user_email ?? '알 수 없는 사용자'}</Text>
                        <Text style={styles.date}>
                          {new Date(m.created_at).toLocaleDateString('ko-KR')} 신청
                        </Text>
                      </View>
                    </View>
                    <View style={styles.actionBtns}>
                      <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(m)}>
                        <Text style={styles.approveBtnText}>승인</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.rejectBtn} onPress={() => handleReject(m)}>
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
                      <Text style={styles.email}>{m.user_email ?? '알 수 없는 사용자'}</Text>
                      <View style={styles.roleBadge}>
                        <Text style={[styles.roleText, m.role === 'admin' && styles.roleAdmin]}>
                          {m.role === 'admin' ? '관리자' : '일반'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {m.role !== 'admin' && (
                    <TouchableOpacity onPress={() => handleRemove(m)}>
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
                    <TouchableOpacity onPress={() => handleRemove(m)}>
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
