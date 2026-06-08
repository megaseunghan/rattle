import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';

function SettingRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.listItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconWrap, { backgroundColor: Colors.gray100 }]}>
        <Ionicons name={icon} size={18} color={Colors.gray500} />
      </View>
      <Text style={styles.itemName}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
    </TouchableOpacity>
  );
}

export default function MoreScreen() {
  const { stores, store: currentStore, switchStore, currentRole } = useAuth();
  const [switching, setSwitching] = useState<string | null>(null);

  async function handleSwitchStore(storeId: string) {
    if (storeId === currentStore?.id) return;
    setSwitching(storeId);
    await switchStore(storeId);
    setSwitching(null);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.title}>더보기</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

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

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>출퇴근</Text>
        <View style={styles.card}>
          <SettingRow
            icon="time-outline"
            label="출퇴근 기록"
            onPress={() => router.push('/attendance')}
          />
          {currentRole === 'admin' && (
            <View style={styles.listItemBorder}>
              <SettingRow
                icon="location-outline"
                label="매장 위치 등록"
                onPress={() => router.push('/settings/store-location')}
              />
            </View>
          )}
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>설정</Text>
        <View style={styles.card}>
          {currentRole === 'admin' && (
            <>
              <SettingRow
                icon="document-text-outline"
                label="전자세금계산서 연동"
                onPress={() => {}}
              />
              <View style={styles.listItemBorder}>
                <SettingRow
                  icon="card-outline"
                  label="TossPos 연동"
                  onPress={() => router.push('/settings/pos-sync')}
                />
              </View>
            </>
          )}
          <View style={currentRole === 'admin' ? styles.listItemBorder : undefined}>
            <SettingRow
              icon="person-outline"
              label="프로필 설정"
              onPress={() => router.push('/settings/profile')}
            />
          </View>
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
  scroll: { padding: 16 },
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
  itemName: { fontSize: 14, fontWeight: '500', color: Colors.black },
  itemSub: { fontSize: 12, marginTop: 1 },
});
