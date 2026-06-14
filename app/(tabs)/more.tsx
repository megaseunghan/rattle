import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { supabase } from '../../lib/supabase';

function SettingRow({
  icon,
  label,
  onPress,
  danger,
  withBorder,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  withBorder?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.listItem, withBorder && styles.listItemBorder]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconWrap, { backgroundColor: danger ? '#FDECEC' : Colors.gray100 }]}>
        <Ionicons name={icon} size={18} color={danger ? Colors.danger : Colors.gray500} />
      </View>
      <Text style={[styles.itemName, danger && { color: Colors.danger }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
    </TouchableOpacity>
  );
}

export default function MoreScreen() {
  const { stores, store: currentStore, switchStore, currentRole, user, signOut } = useAuth();
  const [switching, setSwitching] = useState<string | null>(null);

  const isAdmin = currentRole === 'admin';
  const provider = (user?.app_metadata?.provider as string | undefined) ?? 'email';
  const isEmailUser = provider === 'email';

  async function handleSwitchStore(storeId: string) {
    if (storeId === currentStore?.id) return;
    setSwitching(storeId);
    await switchStore(storeId);
    setSwitching(null);
  }

  function handleSignOut() {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      '회원 탈퇴',
      '정말로 탈퇴하시겠습니까? 매장 정보와 모든 데이터가 즉시 삭제되며 복구할 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴하기',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.functions.invoke('delete-account');
              if (error) throw error;
              await signOut();
              router.replace('/(auth)/login');
            } catch {
              Alert.alert('탈퇴 실패', '탈퇴 처리에 실패했습니다. 고객센터에 문의해주세요.');
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.title}>더보기</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* 매장 선택 */}
        <Text style={styles.sectionLabel}>매장 선택</Text>
        <View style={styles.card}>
          {stores.map((s, i) => {
            const isActive = s.id === currentStore?.id;
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.listItem, i > 0 && styles.listItemBorder]}
                onPress={() => handleSwitchStore(s.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconWrap, { backgroundColor: Colors.gray100 }]}>
                  <Ionicons name="business-outline" size={18} color={Colors.gray500} />
                </View>
                <View style={styles.itemInfoFlex}>
                  <Text style={styles.itemName}>{s.name}</Text>
                  {isActive && (
                    <Text style={[styles.itemSub, { color: Colors.primary }]}>현재 선택됨</Text>
                  )}
                </View>
                {switching === s.id ? (
                  <ActivityIndicator size="small" color={Colors.gray400} />
                ) : isActive ? (
                  <Ionicons name="checkmark" size={18} color={Colors.primary} />
                ) : (
                  <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 계정 */}
        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>계정</Text>
        <View style={styles.card}>
          <SettingRow icon="person-outline" label="내 정보" onPress={() => router.push('/settings/account')} />
          {isEmailUser && (
            <SettingRow icon="lock-closed-outline" label="비밀번호 변경" withBorder onPress={() => router.push('/settings/password')} />
          )}
        </View>

        {/* 매장 (관리자) */}
        {isAdmin && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>매장</Text>
            <View style={styles.card}>
              <SettingRow icon="storefront-outline" label="매장 정보" onPress={() => router.push('/settings/store')} />
              <SettingRow icon="receipt-outline" label="매출 정산 설정" withBorder onPress={() => router.push('/settings/sales')} />
              <SettingRow icon="people-outline" label="멤버 관리" withBorder onPress={() => router.push('/settings/members')} />
              <SettingRow icon="location-outline" label="매장 위치 등록" withBorder onPress={() => router.push('/settings/store-location')} />
            </View>
          </>
        )}

        {/* 연동 (관리자) */}
        {isAdmin && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>연동</Text>
            <View style={styles.card}>
              <SettingRow icon="document-text-outline" label="전자세금계산서 연동" onPress={() => {}} />
              <SettingRow icon="card-outline" label="TossPos 연동" withBorder onPress={() => router.push('/settings/pos-sync')} />
            </View>
          </>
        )}

        {/* 기타 */}
        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>기타</Text>
        <View style={styles.card}>
          <SettingRow icon="time-outline" label="출퇴근 기록" onPress={() => router.push('/attendance')} />
          <SettingRow icon="log-out-outline" label="로그아웃" withBorder onPress={handleSignOut} />
          <SettingRow icon="trash-outline" label="회원 탈퇴" danger withBorder onPress={handleDeleteAccount} />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.gray100,
  },
  title: { fontSize: 17, fontWeight: '600', color: Colors.black },
  scroll: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.gray400,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: Colors.gray100,
    overflow: 'hidden',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  listItemBorder: {
    borderTopWidth: 0.5,
    borderTopColor: Colors.gray100,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfoFlex: { flex: 1 },
  itemName: { flex: 1, fontSize: 14, fontWeight: '500', color: Colors.black },
  itemSub: { fontSize: 12, marginTop: 1 },
});
