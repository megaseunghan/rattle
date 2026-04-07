import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  TextInput, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
  const { user, store, signOut, refreshStore } = useAuth();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(store?.name || '');
  const [closingTime, setClosingTime] = useState(
    (store?.closing_time as string | null | undefined)?.slice(0, 5) ?? '23:00'
  );

  async function handleUpdateProfile() {
    if (!name.trim()) return;
    
    // 시간 형식 검증 (HH:MM)
    if (!/^\d{2}:\d{2}$/.test(closingTime)) {
      Alert.alert('형식 오류', '마감 시간을 HH:MM 형식으로 입력해주세요. (예: 23:00)');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('stores')
        .update({ 
          name: name.trim(),
          closing_time: closingTime,
        })
        .eq('id', store?.id);
      
      if (error) throw error;
      
      await refreshStore();
      Alert.alert('성공', '정보가 수정되었습니다.');
    } catch (e: any) {
      Alert.alert('수정 실패', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteAccount() {
    Alert.alert(
      '회원 탈퇴',
      '정말로 탈퇴하시겠습니까? 매장 정보와 모든 데이터가 즉시 삭제되며 복구할 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴하기',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              // RPC 등을 통해 관련 데이터 일괄 삭제 로직 필요할 수 있음
              const { error } = await supabase.rpc('delete_user_data');
              if (error) throw error;
              
              await signOut();
              router.replace('/(auth)/login');
            } catch (e: any) {
              Alert.alert('탈퇴 실패', '탈퇴 처리에 실패했습니다. 고객센터에 문의해주세요.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  }

  async function handleSignOut() {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/login');
        }
      }
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>내 정보 설정</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.profileSection}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={40} color={Colors.gray300} />
          </View>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>매장 이름</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="매장 이름"
          />

          <Text style={[styles.label, { marginTop: 16 }]}>마감 시간 (HH:MM)</Text>
          <TextInput
            style={styles.input}
            value={closingTime}
            onChangeText={setClosingTime}
            placeholder="23:00"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />

          <TouchableOpacity
            style={[styles.saveBtn, loading && styles.disabled]}
            onPress={handleUpdateProfile}
            disabled={loading}
          >
            {loading ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.saveBtnText}>정보 수정 저장</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.menuCard}>
          <TouchableOpacity style={styles.menuItem} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color={Colors.gray600} />
            <Text style={styles.menuText}>로그아웃</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
          </TouchableOpacity>
          
          <View style={styles.divider} />

          <TouchableOpacity style={styles.menuItem} onPress={handleDeleteAccount}>
            <Ionicons name="trash-outline" size={20} color={Colors.danger} />
            <Text style={[styles.menuText, { color: Colors.danger }]}>회원 탈퇴</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>버전 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.black },
  scroll: { padding: 20 },
  profileSection: { alignItems: 'center', marginVertical: 32 },
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.gray100,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  email: { fontSize: 15, color: Colors.gray500, fontWeight: '500' },
  section: { marginBottom: 32 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginBottom: 8 },
  input: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15,
  },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 12,
  },
  saveBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  menuCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.gray100, overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12,
  },
  menuText: { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.gray800 },
  divider: { height: 1, backgroundColor: Colors.gray50 },
  version: { textAlign: 'center', fontSize: 12, color: Colors.gray300, marginTop: 40 },
});
