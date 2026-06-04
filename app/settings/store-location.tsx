import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { updateStoreLocation } from '../../lib/services/attendance';

export default function StoreLocationScreen() {
  const { store, refreshStore } = useAuth();
  const [loading, setLoading] = useState(false);

  const hasLocation = store?.latitude != null && store?.longitude != null;

  async function handleSetCurrentLocation() {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '위치 권한이 필요합니다.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;

      Alert.alert(
        '위치 등록',
        `현재 위치를 매장 위치로 등록할까요?\n위도 ${latitude.toFixed(6)}\n경도 ${longitude.toFixed(6)}`,
        [
          { text: '취소', style: 'cancel' },
          {
            text: '등록',
            onPress: async () => {
              await updateStoreLocation(store!.id, latitude, longitude);
              await refreshStore();
              Alert.alert('완료', '매장 위치가 등록됐습니다.');
            },
          },
        ],
      );
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>매장 위치 등록</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.infoCard}>
          <Ionicons name="location" size={32} color={Colors.primary} style={{ marginBottom: 12 }} />
          <Text style={styles.infoTitle}>직원 출퇴근 GPS 기준점</Text>
          <Text style={styles.infoDesc}>
            직원이 출퇴근을 찍을 때{'\n'}이 위치에서 40m 이내인지 확인합니다.{'\n'}
            매장 내에서 버튼을 눌러 현재 위치를 등록하세요.
          </Text>
        </View>

        {hasLocation && (
          <View style={styles.currentCard}>
            <View style={styles.currentRow}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              <Text style={styles.currentLabel}>등록된 위치</Text>
            </View>
            <Text style={styles.coordText}>위도 {store!.latitude!.toFixed(6)}</Text>
            <Text style={styles.coordText}>경도 {store!.longitude!.toFixed(6)}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.btn, loading && { opacity: 0.5 }]}
          onPress={handleSetCurrentLocation}
          disabled={loading}
          activeOpacity={0.7}
        >
          {loading
            ? <ActivityIndicator size="small" color={Colors.white} />
            : <>
                <Ionicons name="locate-outline" size={18} color={Colors.white} />
                <Text style={styles.btnText}>{hasLocation ? '현재 위치로 다시 등록' : '현재 위치로 등록'}</Text>
              </>
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.black },

  body: { padding: 20, gap: 16 },
  infoCard: {
    backgroundColor: Colors.tinted, borderRadius: 16, padding: 24, alignItems: 'center',
  },
  infoTitle: { fontSize: 15, fontWeight: '700', color: Colors.deeper, marginBottom: 8 },
  infoDesc: { fontSize: 13, color: Colors.dark, textAlign: 'center', lineHeight: 20 },

  currentCard: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.gray100, padding: 16, gap: 4,
  },
  currentRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  currentLabel: { fontSize: 13, fontWeight: '600', color: Colors.success },
  coordText: { fontSize: 13, color: Colors.gray500 },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14,
  },
  btnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
