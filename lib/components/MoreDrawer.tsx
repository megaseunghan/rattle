import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
  Animated, Pressable, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { CardStyle } from '../../constants/designTokens';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';
import { animateListChange } from '../utils/layoutAnimation';

const DRAWER_WIDTH = Math.min(320, Dimensions.get('window').width * 0.82);

function SettingRow({
  icon, label, onPress, danger, withBorder,
}: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean; withBorder?: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.listItem, withBorder && styles.listItemBorder]} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconWrap, { backgroundColor: danger ? Colors.negativeBg : Colors.gray100 }]}>
        <Ionicons name={icon} size={17} color={danger ? Colors.negative : Colors.gray500} />
      </View>
      <Text style={[styles.itemName, danger && { color: Colors.negative }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={15} color={Colors.gray300} />
    </TouchableOpacity>
  );
}

/** 아코디언처럼 열고 닫히는 섹션 — 헤더 탭하면 카드 리스트가 접히고 펼쳐짐 */
function AccordionSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);

  function toggle() {
    animateListChange();
    setOpen(v => !v);
  }

  return (
    <View style={styles.accordion}>
      <TouchableOpacity style={styles.accordionHeader} onPress={toggle} activeOpacity={0.7}>
        <Text style={styles.sectionLabel}>{title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.gray400} />
      </TouchableOpacity>
      {open && <View style={styles.card}>{children}</View>}
    </View>
  );
}

export function MoreDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { stores, store: currentStore, switchStore, currentRole, user, signOut } = useAuth();
  const [switching, setSwitching] = useState<string | null>(null);
  const [mounted, setMounted] = useState(visible);
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(translateX, { toValue: -DRAWER_WIDTH, duration: 200, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

  const isAdmin = currentRole === 'admin';
  const provider = (user?.app_metadata?.provider as string | undefined) ?? 'email';
  const isEmailUser = provider === 'email';

  async function handleSwitchStore(storeId: string) {
    if (storeId === currentStore?.id) return;
    setSwitching(storeId);
    await switchStore(storeId);
    setSwitching(null);
    onClose();
  }

  function go(path: string) {
    onClose();
    router.push(path as any);
  }

  function handleSignOut() {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        onPress: async () => {
          onClose();
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
              onClose();
              await signOut();
              router.replace('/(auth)/login');
            } catch {
              Alert.alert('탈퇴 실패', '탈퇴 처리에 실패했습니다. 고객센터에 문의해주세요.');
            }
          },
        },
      ],
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.drawer, { width: DRAWER_WIDTH, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12, transform: [{ translateX }] }]}>
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>더보기</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={Colors.gray500} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.profileRow} onPress={() => go('/mypage')} activeOpacity={0.7}>
            <View style={styles.profileAvatar}>
              <Ionicons name="person" size={20} color={Colors.primary} />
            </View>
            <View style={styles.itemInfoFlex}>
              <Text style={styles.profileName} numberOfLines={1}>{user?.email ?? '내 계정'}</Text>
              <Text style={styles.profileSub}>마이페이지</Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={Colors.gray300} />
          </TouchableOpacity>

          <AccordionSection title="매장 관리">
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
                    <Ionicons name="business-outline" size={17} color={Colors.gray500} />
                  </View>
                  <View style={styles.itemInfoFlex}>
                    <Text style={styles.itemName} numberOfLines={1}>{s.name}</Text>
                    {isActive && <Text style={[styles.itemSub, { color: Colors.primary }]}>현재 선택됨</Text>}
                  </View>
                  {switching === s.id ? (
                    <ActivityIndicator size="small" color={Colors.gray400} />
                  ) : isActive ? (
                    <Ionicons name="checkmark" size={17} color={Colors.primary} />
                  ) : (
                    <Ionicons name="chevron-forward" size={15} color={Colors.gray300} />
                  )}
                </TouchableOpacity>
              );
            })}
          </AccordionSection>

          <AccordionSection title="설정">
            {isAdmin && <SettingRow icon="storefront-outline" label="매장 정보" onPress={() => go('/settings/store')} />}
            {isAdmin && <SettingRow icon="people-outline" label="멤버 관리" withBorder onPress={() => go('/settings/members')} />}
            {isAdmin && <SettingRow icon="card-outline" label="TossPos 연동" withBorder onPress={() => go('/settings/pos-sync')} />}
            {isAdmin && <SettingRow icon="notifications-outline" label="알림 설정" withBorder onPress={() => go('/notifications/settings')} />}
            <SettingRow icon="time-outline" label="출퇴근 기록" withBorder={isAdmin} onPress={() => go('/attendance')} />
            <SettingRow icon="checkmark-done-outline" label="청소 체크리스트" withBorder onPress={() => go('/cleaning')} />
            {isEmailUser && (
              <SettingRow icon="lock-closed-outline" label="비밀번호 변경" withBorder onPress={() => go('/settings/password')} />
            )}
            <SettingRow icon="document-text-outline" label="이용약관" withBorder onPress={() => go('/legal/terms')} />
            <SettingRow icon="shield-checkmark-outline" label="개인정보처리방침" withBorder onPress={() => go('/legal/privacy')} />
            <SettingRow icon="log-out-outline" label="로그아웃" withBorder onPress={handleSignOut} />
          </AccordionSection>

          <TouchableOpacity style={styles.dangerTextRow} onPress={handleDeleteAccount} activeOpacity={0.7}>
            <Text style={styles.dangerText}>회원 탈퇴</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
  drawer: {
    position: 'absolute', top: 0, bottom: 0, left: 0,
    backgroundColor: Colors.gray50, paddingHorizontal: 16,
    shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 16,
  },
  drawerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 14, marginBottom: 4,
  },
  drawerTitle: { fontSize: 17, fontWeight: '700', color: Colors.black },

  scroll: { paddingBottom: 40 },
  profileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 0.5, borderColor: Colors.gray100,
    padding: 14, marginBottom: 18,
  },
  profileAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.tinted, justifyContent: 'center', alignItems: 'center',
  },
  profileName: { fontSize: 14, fontWeight: '700', color: Colors.black },
  profileSub: { fontSize: 11, fontWeight: '500', color: Colors.gray400, marginTop: 2 },

  accordion: { marginBottom: 16 },
  accordionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },

  dangerTextRow: { alignItems: 'center', paddingVertical: 16 },
  dangerText: { fontSize: 14, fontWeight: '600', color: Colors.negative },
  sectionLabel: {
    fontSize: 11, fontWeight: '500', color: Colors.gray400,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  card: { ...CardStyle, overflow: 'hidden' },
  listItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  listItemBorder: { borderTopWidth: 0.5, borderTopColor: Colors.gray100 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  itemInfoFlex: { flex: 1 },
  itemName: { flex: 1, fontSize: 14, fontWeight: '500', color: Colors.black },
  itemSub: { fontSize: 12, marginTop: 1 },
});
